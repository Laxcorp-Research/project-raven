use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use windows::{
    core::*,
    Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
    Win32::Media::Audio::*,
    Win32::System::Com::{StructuredStorage::PropVariantClear, *},
};

use crate::AudioChunk;

const TARGET_SAMPLE_RATE: u32 = 16000;
const BUFFER_DURATION_MS: u32 = 20;
const RESAMPLE_CHUNK_SIZE: usize = 1024;
const SILENT_FLAG: u32 = 0x2;

pub struct OutputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

struct ComGuard;

impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

struct ResampleBuffer {
    resampler: SincFixedIn<f32>,
    pending: Vec<f32>,
    chunk_size: usize,
}

impl ResampleBuffer {
    fn new(source_rate: u32, target_rate: u32) -> Self {
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: WindowFunction::BlackmanHarris2,
        };

        let resampler = SincFixedIn::<f32>::new(
            target_rate as f64 / source_rate as f64,
            2.0,
            params,
            RESAMPLE_CHUNK_SIZE,
            1,
        )
        .expect("Failed to create resampler");

        ResampleBuffer {
            resampler,
            pending: Vec::with_capacity(RESAMPLE_CHUNK_SIZE * 2),
            chunk_size: RESAMPLE_CHUNK_SIZE,
        }
    }

    fn process(&mut self, mono_samples: &[f32]) -> Vec<f32> {
        self.pending.extend_from_slice(mono_samples);
        let mut output = Vec::new();

        while self.pending.len() >= self.chunk_size {
            let chunk: Vec<f32> = self.pending.drain(..self.chunk_size).collect();
            let input = vec![chunk];
            match self.resampler.process(&input, None) {
                Ok(result) => {
                    if let Some(ch) = result.into_iter().next() {
                        output.extend(ch);
                    }
                }
                Err(e) => {
                    eprintln!("[WASAPI] Resample error: {:?}", e);
                }
            }
        }

        output
    }
}

fn mono_to_i16_bytes(resampled: &[f32]) -> Vec<u8> {
    resampled
        .iter()
        .flat_map(|&s| ((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes())
        .collect()
}

fn timestamp_now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
        * 1000.0
}

pub fn list_output_devices() -> Result<Vec<OutputDevice>> {
    list_audio_devices(eRender, eMultimedia)
}

pub fn list_input_devices() -> Result<Vec<OutputDevice>> {
    list_audio_devices(eCapture, eCommunications)
}

fn list_audio_devices(data_flow: EDataFlow, role: ERole) -> Result<Vec<OutputDevice>> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)?;
        let _com_guard = ComGuard;
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let default_device = enumerator.GetDefaultAudioEndpoint(data_flow, role)?;
        let default_id = device_id(&default_device)?;
        let collection = enumerator.EnumAudioEndpoints(data_flow, DEVICE_STATE_ACTIVE)?;
        let count = collection.GetCount()?;
        let mut devices = Vec::with_capacity(count as usize);

        for index in 0..count {
            let device = collection.Item(index)?;
            let id = device_id(&device)?;
            let name = device_name(&device).unwrap_or_else(|_| "Unknown playback device".to_string());
            devices.push(OutputDevice {
                is_default: id == default_id,
                id,
                name,
            });
        }

        Ok(devices)
    }
}

unsafe fn device_id(device: &IMMDevice) -> Result<String> {
    let value = device.GetId()?;
    let id = value.to_string()?;
    CoTaskMemFree(Some(value.0.cast()));
    Ok(id)
}

unsafe fn device_name(device: &IMMDevice) -> Result<String> {
    let store = device.OpenPropertyStore(STGM_READ)?;
    let mut value = store.GetValue(&PKEY_Device_FriendlyName)?;
    let name = value.Anonymous.Anonymous.Anonymous.pwszVal.to_string()?;
    PropVariantClear(&mut value)?;
    Ok(name)
}

unsafe fn selected_audio_device(
    enumerator: &IMMDeviceEnumerator,
    device_id: Option<&str>,
    data_flow: EDataFlow,
    role: ERole,
) -> Result<IMMDevice> {
    if let Some(id) = device_id.filter(|id| !id.trim().is_empty()) {
        let wide: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
        if let Ok(device) = enumerator.GetDevice(PCWSTR(wide.as_ptr())) {
            return Ok(device);
        }
        eprintln!("[WASAPI] Selected audio device is unavailable; using Windows default");
    }
    enumerator.GetDefaultAudioEndpoint(data_flow, role)
}

pub fn capture_loop<F>(stop_flag: Arc<AtomicBool>, device_id: Option<String>, callback: F) -> Result<()>
where
    F: Fn(AudioChunk) + Send + 'static,
{
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)?;
        let _com_guard = ComGuard;

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

        let device = selected_audio_device(&enumerator, device_id.as_deref(), eRender, eMultimedia)?;

        let audio_client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;

        let pwfx = audio_client.GetMixFormat()?;
        let format = &*pwfx;

        let source_sample_rate = format.nSamplesPerSec;
        let source_channels = format.nChannels as usize;
        let bits_per_sample = format.wBitsPerSample;

        println!(
            "[WASAPI] Source format: {}Hz, {} channels, {} bits",
            source_sample_rate, source_channels, bits_per_sample
        );

        let buffer_duration = 10_000_000i64;
        audio_client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            buffer_duration,
            0,
            pwfx,
            None,
        )?;

        let capture_client: IAudioCaptureClient = audio_client.GetService()?;

        audio_client.Start()?;
        println!("[WASAPI] Capture started");

        let needs_resample = source_sample_rate != TARGET_SAMPLE_RATE;
        let mut resampler = if needs_resample {
            Some(ResampleBuffer::new(source_sample_rate, TARGET_SAMPLE_RATE))
        } else {
            None
        };

        let mut chunk_count = 0u64;

        while !stop_flag.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(
                BUFFER_DURATION_MS as u64,
            ));

            loop {
                let packet_length = capture_client.GetNextPacketSize()?;

                if packet_length == 0 {
                    break;
                }

                let mut data_ptr: *mut u8 = std::ptr::null_mut();
                let mut num_frames = 0u32;
                let mut flags = 0u32;

                capture_client.GetBuffer(
                    &mut data_ptr,
                    &mut num_frames,
                    &mut flags,
                    None,
                    None,
                )?;

                if num_frames > 0 {
                    let mono = if flags & SILENT_FLAG != 0 || data_ptr.is_null() {
                        vec![0.0f32; num_frames as usize]
                    } else {
                        let samples = convert_to_f32(
                            data_ptr,
                            num_frames as usize,
                            source_channels,
                            bits_per_sample,
                        );
                        samples
                            .chunks(source_channels)
                            .map(|frame| frame.iter().sum::<f32>() / source_channels as f32)
                            .collect()
                    };

                    let resampled = if let Some(ref mut rs) = resampler {
                        rs.process(&mono)
                    } else {
                        mono
                    };

                    if !resampled.is_empty() {
                        let bytes = mono_to_i16_bytes(&resampled);

                        if !bytes.is_empty() {
                            chunk_count += 1;
                            let timestamp = timestamp_now();

                            if chunk_count <= 5 || chunk_count % 100 == 0 {
                                println!(
                                    "[WASAPI] Chunk #{}, bytes: {}",
                                    chunk_count,
                                    bytes.len()
                                );
                            }

                            callback(AudioChunk { data: bytes, timestamp });
                        }
                    }
                }

                capture_client.ReleaseBuffer(num_frames)?;
            }
        }

        audio_client.Stop()?;
        println!("[WASAPI] Capture stopped. Total chunks: {}", chunk_count);

        Ok(())
    }
}

/// Capture microphone input from the default recording device.
/// Same pipeline as capture_loop but uses eCapture (input) instead of eRender (loopback).
pub fn mic_capture_loop<F>(stop_flag: Arc<AtomicBool>, device_id: Option<String>, callback: F) -> Result<()>
where
    F: Fn(AudioChunk) + Send + 'static,
{
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)?;
        let _com_guard = ComGuard;

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

        let device = selected_audio_device(&enumerator, device_id.as_deref(), eCapture, eCommunications)?;

        let audio_client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;

        let pwfx = audio_client.GetMixFormat()?;
        let format = &*pwfx;

        let source_sample_rate = format.nSamplesPerSec;
        let source_channels = format.nChannels as usize;
        let bits_per_sample = format.wBitsPerSample;

        println!(
            "[WASAPI-Mic] Source format: {}Hz, {} channels, {} bits",
            source_sample_rate, source_channels, bits_per_sample
        );

        let buffer_duration = 10_000_000i64;
        audio_client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            0,
            buffer_duration,
            0,
            pwfx,
            None,
        )?;

        let capture_client: IAudioCaptureClient = audio_client.GetService()?;

        audio_client.Start()?;
        println!("[WASAPI-Mic] Capture started");

        let needs_resample = source_sample_rate != TARGET_SAMPLE_RATE;
        let mut resampler = if needs_resample {
            Some(ResampleBuffer::new(source_sample_rate, TARGET_SAMPLE_RATE))
        } else {
            None
        };

        let mut chunk_count = 0u64;

        while !stop_flag.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(
                BUFFER_DURATION_MS as u64,
            ));

            loop {
                let packet_length = capture_client.GetNextPacketSize()?;

                if packet_length == 0 {
                    break;
                }

                let mut data_ptr: *mut u8 = std::ptr::null_mut();
                let mut num_frames = 0u32;
                let mut flags = 0u32;

                capture_client.GetBuffer(
                    &mut data_ptr,
                    &mut num_frames,
                    &mut flags,
                    None,
                    None,
                )?;

                if num_frames > 0 {
                    let mono = if flags & SILENT_FLAG != 0 || data_ptr.is_null() {
                        vec![0.0f32; num_frames as usize]
                    } else {
                        let samples = convert_to_f32(
                            data_ptr,
                            num_frames as usize,
                            source_channels,
                            bits_per_sample,
                        );
                        samples
                            .chunks(source_channels)
                            .map(|frame| frame.iter().sum::<f32>() / source_channels as f32)
                            .collect()
                    };

                    let resampled = if let Some(ref mut rs) = resampler {
                        rs.process(&mono)
                    } else {
                        mono
                    };

                    if !resampled.is_empty() {
                        let bytes = mono_to_i16_bytes(&resampled);

                        if !bytes.is_empty() {
                            chunk_count += 1;
                            let timestamp = timestamp_now();

                            if chunk_count <= 5 || chunk_count % 100 == 0 {
                                println!(
                                    "[WASAPI-Mic] Chunk #{}, bytes: {}",
                                    chunk_count,
                                    bytes.len()
                                );
                            }

                            callback(AudioChunk { data: bytes, timestamp });
                        }
                    }
                }

                capture_client.ReleaseBuffer(num_frames)?;
            }
        }

        audio_client.Stop()?;
        println!(
            "[WASAPI-Mic] Capture stopped. Total chunks: {}",
            chunk_count
        );

        Ok(())
    }
}

unsafe fn convert_to_f32(
    data_ptr: *mut u8,
    num_frames: usize,
    channels: usize,
    bits_per_sample: u16,
) -> Vec<f32> {
    let total_samples = num_frames * channels;

    match bits_per_sample {
        16 => {
            let slice = std::slice::from_raw_parts(data_ptr as *const i16, total_samples);
            slice.iter().map(|&s| s as f32 / 32768.0).collect()
        }
        32 => {
            let slice = std::slice::from_raw_parts(data_ptr as *const f32, total_samples);
            slice.to_vec()
        }
        _ => {
            eprintln!("[WASAPI] Unsupported bits per sample: {}", bits_per_sample);
            vec![0.0; total_samples]
        }
    }
}

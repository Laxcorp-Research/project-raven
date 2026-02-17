use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use windows::{
    core::*,
    Win32::Foundation::*,
    Win32::Media::Audio::*,
    Win32::System::Com::*,
};

use crate::AudioChunk;

const TARGET_SAMPLE_RATE: u32 = 16000;
const BUFFER_DURATION_MS: u32 = 20;

pub fn capture_loop<F>(stop_flag: Arc<AtomicBool>, callback: F) -> Result<()>
where
    F: Fn(AudioChunk) + Send + 'static,
{
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)?;

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;

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
            let params = SincInterpolationParameters {
                sinc_len: 256,
                f_cutoff: 0.95,
                interpolation: SincInterpolationType::Linear,
                oversampling_factor: 256,
                window: WindowFunction::BlackmanHarris2,
            };
            Some(
                SincFixedIn::<f32>::new(
                    TARGET_SAMPLE_RATE as f64 / source_sample_rate as f64,
                    2.0,
                    params,
                    1024,
                    1,
                )
                .expect("Failed to create resampler"),
            )
        } else {
            None
        };

        let mut chunk_count = 0u64;

        while !stop_flag.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(
                BUFFER_DURATION_MS as u64,
            ));

            loop {
                let mut packet_length = 0u32;
                capture_client.GetNextPacketSize(&mut packet_length)?;

                if packet_length == 0 {
                    break;
                }

                let mut data_ptr = std::ptr::null_mut();
                let mut num_frames = 0u32;
                let mut flags = 0u32;

                capture_client.GetBuffer(
                    &mut data_ptr,
                    &mut num_frames,
                    &mut flags,
                    None,
                    None,
                )?;

                if num_frames > 0 && !data_ptr.is_null() {
                    let samples = convert_to_f32(
                        data_ptr,
                        num_frames as usize,
                        source_channels,
                        bits_per_sample,
                    );

                    let mono: Vec<f32> = samples
                        .chunks(source_channels)
                        .map(|frame| frame.iter().sum::<f32>() / source_channels as f32)
                        .collect();

                    let resampled = if let Some(ref mut rs) = resampler {
                        let input = vec![mono];
                        match rs.process(&input, None) {
                            Ok(output) => output.into_iter().next().unwrap_or_default(),
                            Err(_) => mono,
                        }
                    } else {
                        mono
                    };

                    let int16: Vec<i16> = resampled
                        .iter()
                        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
                        .collect();

                    let bytes: Vec<u8> = int16
                        .iter()
                        .flat_map(|&s| s.to_le_bytes())
                        .collect();

                    if !bytes.is_empty() {
                        chunk_count += 1;
                        let timestamp = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_secs_f64()
                            * 1000.0;

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

                capture_client.ReleaseBuffer(num_frames)?;
            }
        }

        audio_client.Stop()?;
        CoUninitialize();
        println!("[WASAPI] Capture stopped. Total chunks: {}", chunk_count);

        Ok(())
    }
}

/// Capture microphone input from the default recording device.
/// Same pipeline as capture_loop but uses eCapture (input) instead of eRender (loopback).
pub fn mic_capture_loop<F>(stop_flag: Arc<AtomicBool>, callback: F) -> Result<()>
where
    F: Fn(AudioChunk) + Send + 'static,
{
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)?;

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

        let device = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)?;

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
            AUDCLNT_STREAMFLAGS(0), // No loopback flag for mic capture
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
            let params = SincInterpolationParameters {
                sinc_len: 256,
                f_cutoff: 0.95,
                interpolation: SincInterpolationType::Linear,
                oversampling_factor: 256,
                window: WindowFunction::BlackmanHarris2,
            };
            Some(
                SincFixedIn::<f32>::new(
                    TARGET_SAMPLE_RATE as f64 / source_sample_rate as f64,
                    2.0,
                    params,
                    1024,
                    1,
                )
                .expect("Failed to create mic resampler"),
            )
        } else {
            None
        };

        let mut chunk_count = 0u64;

        while !stop_flag.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(
                BUFFER_DURATION_MS as u64,
            ));

            loop {
                let mut packet_length = 0u32;
                capture_client.GetNextPacketSize(&mut packet_length)?;

                if packet_length == 0 {
                    break;
                }

                let mut data_ptr = std::ptr::null_mut();
                let mut num_frames = 0u32;
                let mut flags = 0u32;

                capture_client.GetBuffer(
                    &mut data_ptr,
                    &mut num_frames,
                    &mut flags,
                    None,
                    None,
                )?;

                if num_frames > 0 && !data_ptr.is_null() {
                    let samples = convert_to_f32(
                        data_ptr,
                        num_frames as usize,
                        source_channels,
                        bits_per_sample,
                    );

                    let mono: Vec<f32> = samples
                        .chunks(source_channels)
                        .map(|frame| frame.iter().sum::<f32>() / source_channels as f32)
                        .collect();

                    let resampled = if let Some(ref mut rs) = resampler {
                        let input = vec![mono];
                        match rs.process(&input, None) {
                            Ok(output) => output.into_iter().next().unwrap_or_default(),
                            Err(_) => mono,
                        }
                    } else {
                        mono
                    };

                    let int16: Vec<i16> = resampled
                        .iter()
                        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
                        .collect();

                    let bytes: Vec<u8> = int16
                        .iter()
                        .flat_map(|&s| s.to_le_bytes())
                        .collect();

                    if !bytes.is_empty() {
                        chunk_count += 1;
                        let timestamp = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_secs_f64()
                            * 1000.0;

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

                capture_client.ReleaseBuffer(num_frames)?;
            }
        }

        audio_client.Stop()?;
        CoUninitialize();
        println!("[WASAPI-Mic] Capture stopped. Total chunks: {}", chunk_count);

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

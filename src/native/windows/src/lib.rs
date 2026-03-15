#![deny(clippy::all)]

use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction,
};
use std::panic;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

#[macro_use]
extern crate napi_derive;

mod wasapi;

static CAPTURING: AtomicBool = AtomicBool::new(false);
static STOP_FLAG: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

static MIC_CAPTURING: AtomicBool = AtomicBool::new(false);
static MIC_STOP_FLAG: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

#[napi]
pub fn is_system_audio_available() -> bool {
    true
}

#[napi]
pub fn has_permission() -> bool {
    true
}

#[napi]
pub fn request_permission() -> bool {
    true
}

#[napi]
pub fn is_capturing() -> bool {
    CAPTURING.load(Ordering::SeqCst)
}

#[napi]
pub fn start_system_audio_capture(callback: JsFunction) -> Result<bool> {
    eprintln!("[WASAPI] start_system_audio_capture called");
    if CAPTURING.load(Ordering::SeqCst) {
        return Ok(false);
    }

    let tsfn: ThreadsafeFunction<AudioChunk, ErrorStrategy::Fatal> =
        callback.create_threadsafe_function(0, |ctx| {
            let chunk: AudioChunk = ctx.value;
            let mut obj = ctx.env.create_object()?;

            let buffer = ctx.env.create_buffer_with_data(chunk.data)?;
            obj.set("data", buffer.into_raw())?;
            obj.set("timestamp", chunk.timestamp)?;

            Ok(vec![obj])
        })?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    *STOP_FLAG.lock().unwrap() = Some(stop_flag.clone());

    CAPTURING.store(true, Ordering::SeqCst);

    thread::spawn(move || {
        eprintln!("[WASAPI] System capture thread started");
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            wasapi::capture_loop(stop_flag, move |chunk| {
                tsfn.call(chunk, ThreadsafeFunctionCallMode::NonBlocking);
            })
        }));
        match result {
            Ok(Ok(())) => eprintln!("[WASAPI] System capture ended normally"),
            Ok(Err(e)) => eprintln!("[WASAPI] Capture error: {:?}", e),
            Err(panic_info) => eprintln!("[WASAPI] Capture PANICKED: {:?}", panic_info),
        }
        CAPTURING.store(false, Ordering::SeqCst);
    });

    Ok(true)
}

#[napi]
pub fn stop_system_audio_capture() -> bool {
    let mut guard = STOP_FLAG.lock().unwrap();
    if let Some(flag) = guard.take() {
        flag.store(true, Ordering::SeqCst);
        return true;
    }
    false
}

#[napi]
pub fn start_mic_capture(callback: JsFunction) -> Result<bool> {
    eprintln!("[WASAPI-Mic] start_mic_capture called");
    if MIC_CAPTURING.load(Ordering::SeqCst) {
        return Ok(false);
    }

    let tsfn: ThreadsafeFunction<AudioChunk, ErrorStrategy::Fatal> =
        callback.create_threadsafe_function(0, |ctx| {
            let chunk: AudioChunk = ctx.value;
            let mut obj = ctx.env.create_object()?;

            let buffer = ctx.env.create_buffer_with_data(chunk.data)?;
            obj.set("data", buffer.into_raw())?;
            obj.set("timestamp", chunk.timestamp)?;

            Ok(vec![obj])
        })?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    *MIC_STOP_FLAG.lock().unwrap() = Some(stop_flag.clone());

    MIC_CAPTURING.store(true, Ordering::SeqCst);

    thread::spawn(move || {
        eprintln!("[WASAPI-Mic] Mic capture thread started");
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            wasapi::mic_capture_loop(stop_flag, move |chunk| {
                tsfn.call(chunk, ThreadsafeFunctionCallMode::NonBlocking);
            })
        }));
        match result {
            Ok(Ok(())) => eprintln!("[WASAPI-Mic] Mic capture ended normally"),
            Ok(Err(e)) => eprintln!("[WASAPI-Mic] Capture error: {:?}", e),
            Err(panic_info) => eprintln!("[WASAPI-Mic] Capture PANICKED: {:?}", panic_info),
        }
        MIC_CAPTURING.store(false, Ordering::SeqCst);
    });

    Ok(true)
}

#[napi]
pub fn stop_mic_capture() -> bool {
    let mut guard = MIC_STOP_FLAG.lock().unwrap();
    if let Some(flag) = guard.take() {
        flag.store(true, Ordering::SeqCst);
        return true;
    }
    false
}

#[derive(Clone)]
pub struct AudioChunk {
    pub data: Vec<u8>,
    pub timestamp: f64,
}

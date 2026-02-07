#![deny(clippy::all)]

use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

#[macro_use]
extern crate napi_derive;

mod wasapi;

static CAPTURING: AtomicBool = AtomicBool::new(false);
static mut STOP_FLAG: Option<Arc<AtomicBool>> = None;

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
    if CAPTURING.load(Ordering::SeqCst) {
        return Ok(false);
    }

    let tsfn: ThreadsafeFunction<AudioChunk, _> = callback.create_threadsafe_function(0, |ctx| {
        let chunk = ctx.value;
        let mut obj = ctx.env.create_object()?;

        let buffer = ctx.env.create_buffer_with_data(chunk.data)?;
        obj.set("data", buffer.into_raw())?;
        obj.set("timestamp", chunk.timestamp)?;

        Ok(vec![obj])
    })?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    unsafe {
        STOP_FLAG = Some(stop_flag.clone());
    }

    CAPTURING.store(true, Ordering::SeqCst);

    thread::spawn(move || {
        if let Err(e) = wasapi::capture_loop(stop_flag, move |chunk| {
            tsfn.call(chunk, ThreadsafeFunctionCallMode::NonBlocking);
        }) {
            eprintln!("[WASAPI] Capture error: {:?}", e);
        }
        CAPTURING.store(false, Ordering::SeqCst);
    });

    Ok(true)
}

#[napi]
pub fn stop_system_audio_capture() -> bool {
    unsafe {
        if let Some(ref flag) = STOP_FLAG {
            flag.store(true, Ordering::SeqCst);
            STOP_FLAG = None;
            return true;
        }
    }
    false
}

#[derive(Clone)]
pub struct AudioChunk {
    pub data: Vec<u8>,
    pub timestamp: f64,
}

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
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

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

/// Exclude a top-level window from the taskbar AND the Alt-Tab switcher
/// while keeping it focusable.
///
/// The overlay must stay focusable so setIgnoreMouseEvents(forward:true)
/// mouse-move forwarding survives a hide -> re-show (issue D). A focusable
/// top-level window otherwise appears in Alt-Tab; Electron's `skipTaskbar`
/// only removes the taskbar button, not the Alt-Tab entry. WS_EX_TOOLWINDOW
/// removes it from both while preserving activation and keyboard input.
///
/// `handle` is BrowserWindow.getNativeWindowHandle() - an 8-byte
/// little-endian HWND pointer on win32-x64. Returns false (never panics) if
/// the handle is unusable. Intended to be applied while the window is still
/// hidden so the style is in effect before its first show.
#[napi]
pub fn set_window_tool_window(handle: Buffer) -> bool {
    let bytes: &[u8] = handle.as_ref();
    let raw = match bytes.get(0..8).and_then(|b| <[u8; 8]>::try_from(b).ok()) {
        Some(arr) => u64::from_le_bytes(arr),
        None => return false,
    };
    if raw == 0 {
        return false;
    }
    let hwnd = HWND(raw as isize);
    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let new_ex_style =
            (ex_style | (WS_EX_TOOLWINDOW.0 as isize)) & !(WS_EX_APPWINDOW.0 as isize);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex_style);
        // Force the extended-style change to take effect without moving,
        // resizing, re-ordering, or activating the (still-hidden) window.
        let _ = SetWindowPos(
            hwnd,
            HWND(0),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
    true
}

#[derive(Clone)]
pub struct AudioChunk {
    pub data: Vec<u8>,
    pub timestamp: f64,
}

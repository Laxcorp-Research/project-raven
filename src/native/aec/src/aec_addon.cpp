/**
 * GStreamer-based AEC (Acoustic Echo Cancellation) NAPI addon.
 *
 * Uses the webrtcechoprobe/webrtcdsp pipeline (same AEC3 engine as
 * Chrome / Recall.ai). Adds production resilience:
 *   - Timestamp drift detection between mic and system streams
 *   - Push failure tracking (buffer overflow)
 *   - RMS level monitoring on all streams
 *   - Output stall detection
 *
 * Pipeline:
 *   System audio: appsrc -> audioconvert -> audioresample -> webrtcechoprobe -> fakesink
 *   Mic audio:    appsrc -> audioconvert -> audioresample -> webrtcdsp -> appsink
 */

#include <napi.h>
#include <gst/gst.h>
#include <gst/app/gstappsrc.h>
#include <gst/app/gstappsink.h>
#include <memory>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <cmath>
#include <string>
#include <chrono>

static constexpr int kSampleRate = 16000;
static constexpr int kNumChannels = 1;
static constexpr const char* kAudioFormat = "S16LE";
static constexpr int kBytesPerSample = 2;

static bool gst_initialized = false;

// Compute RMS of S16LE audio. Returns value in [0, 32768].
static double ComputeRMS(const uint8_t* data, size_t length) {
    const int16_t* samples = reinterpret_cast<const int16_t*>(data);
    size_t n = length / sizeof(int16_t);
    if (n == 0) return 0.0;

    double sum_sq = 0.0;
    for (size_t i = 0; i < n; i++) {
        double s = static_cast<double>(samples[i]);
        sum_sq += s * s;
    }
    return std::sqrt(sum_sq / static_cast<double>(n));
}

using SteadyClock = std::chrono::steady_clock;
using TimePoint = SteadyClock::time_point;

struct StreamStats {
    int64_t buffers_pushed = 0;
    int64_t push_failures = 0;
    double audio_ms = 0.0;
    double last_rms = 0.0;

    TimePoint first_push_time{};
    bool started = false;

    void RecordPush(double chunk_ms, double rms, bool ok) {
        if (!started) {
            first_push_time = SteadyClock::now();
            started = true;
        }
        buffers_pushed++;
        audio_ms += chunk_ms;
        last_rms = rms;
        if (!ok) push_failures++;
    }

    double WallElapsedMs() const {
        if (!started) return 0.0;
        auto now = SteadyClock::now();
        return std::chrono::duration<double, std::milli>(now - first_push_time).count();
    }

    // How far this stream's audio clock deviates from wall clock.
    // Positive = audio ahead of wall (producing faster than real-time).
    // Negative = audio behind wall (producing slower than real-time).
    double ClockOffsetMs() const {
        if (!started) return 0.0;
        return audio_ms - WallElapsedMs();
    }
};

class GstAecPipeline {
public:
    bool Init(const std::string& plugin_path) {
        if (!gst_initialized) {
            if (!plugin_path.empty()) {
                const char* existing = getenv("GST_PLUGIN_PATH");
                std::string new_path = plugin_path;
                if (existing && strlen(existing) > 0) {
#ifdef _WIN32
                    new_path += ";";
#else
                    new_path += ":";
#endif
                    new_path += existing;
                }
#ifdef _WIN32
                _putenv_s("GST_PLUGIN_PATH", new_path.c_str());
#else
                setenv("GST_PLUGIN_PATH", new_path.c_str(), 1);
#endif
            }
            gst_init(nullptr, nullptr);
            gst_initialized = true;
        }

        pipeline_ = gst_pipeline_new("aec-pipeline");
        if (!pipeline_) return false;

        system_src_ = gst_element_factory_make("appsrc", "system-src");
        GstElement* sys_convert = gst_element_factory_make("audioconvert", "sys-convert");
        GstElement* sys_resample = gst_element_factory_make("audioresample", "sys-resample");
        echoprobe_ = gst_element_factory_make("webrtcechoprobe", "echoprobe");
        GstElement* sys_sink = gst_element_factory_make("fakesink", "sys-sink");

        mic_src_ = gst_element_factory_make("appsrc", "mic-src");
        GstElement* mic_convert = gst_element_factory_make("audioconvert", "mic-convert");
        GstElement* mic_resample = gst_element_factory_make("audioresample", "mic-resample");
        webrtcdsp_ = gst_element_factory_make("webrtcdsp", "webrtcdsp");
        output_sink_ = gst_element_factory_make("appsink", "output-sink");

        if (!system_src_ || !sys_convert || !sys_resample || !echoprobe_ || !sys_sink ||
            !mic_src_ || !mic_convert || !mic_resample || !webrtcdsp_ || !output_sink_) {
            if (!echoprobe_) fprintf(stderr, "AEC: Failed to create webrtcechoprobe - plugin not found\n");
            if (!webrtcdsp_) fprintf(stderr, "AEC: Failed to create webrtcdsp - plugin not found\n");
            if (pipeline_) gst_object_unref(pipeline_);
            pipeline_ = nullptr;
            return false;
        }

        g_object_set(webrtcdsp_, "probe", "echoprobe", nullptr);

        GstCaps* caps = gst_caps_new_simple("audio/x-raw",
            "format", G_TYPE_STRING, kAudioFormat,
            "rate", G_TYPE_INT, kSampleRate,
            "channels", G_TYPE_INT, kNumChannels,
            "layout", G_TYPE_STRING, "interleaved",
            nullptr);

        // Limit appsrc internal queues so overflow is detectable via push failures
        // 1 second of audio at 16kHz mono S16LE = 32000 bytes
        const guint64 max_bytes = 32000 * 2; // 2 seconds of buffer

        g_object_set(system_src_,
            "caps", caps,
            "format", GST_FORMAT_TIME,
            "is-live", TRUE,
            "do-timestamp", FALSE,
            "max-bytes", max_bytes,
            nullptr);

        g_object_set(mic_src_,
            "caps", caps,
            "format", GST_FORMAT_TIME,
            "is-live", TRUE,
            "do-timestamp", FALSE,
            "max-bytes", max_bytes,
            nullptr);

        gst_caps_unref(caps);

        g_object_set(output_sink_,
            "emit-signals", FALSE,
            "sync", FALSE,
            "max-buffers", 100,
            "drop", FALSE,
            nullptr);

        g_object_set(sys_sink,
            "sync", FALSE,
            "async", FALSE,
            "enable-last-sample", FALSE,
            nullptr);

        gst_bin_add_many(GST_BIN(pipeline_),
            system_src_, sys_convert, sys_resample, echoprobe_, sys_sink,
            mic_src_, mic_convert, mic_resample, webrtcdsp_, output_sink_,
            nullptr);

        if (!gst_element_link_many(system_src_, sys_convert, sys_resample, echoprobe_, sys_sink, nullptr)) {
            gst_object_unref(pipeline_);
            pipeline_ = nullptr;
            return false;
        }

        if (!gst_element_link_many(mic_src_, mic_convert, mic_resample, webrtcdsp_, output_sink_, nullptr)) {
            gst_object_unref(pipeline_);
            pipeline_ = nullptr;
            return false;
        }

        GstStateChangeReturn ret = gst_element_set_state(pipeline_, GST_STATE_PLAYING);
        if (ret == GST_STATE_CHANGE_FAILURE) {
            gst_object_unref(pipeline_);
            pipeline_ = nullptr;
            return false;
        }

        initialized_ = true;
        sys_stats_ = {};
        mic_stats_ = {};
        output_pulled_ = 0;
        output_last_rms_ = 0.0;
        consecutive_empty_pulls_ = 0;

        return true;
    }

    void PushSystemAudio(const uint8_t* data, size_t length) {
        if (!initialized_ || !system_src_) return;

        double rms = ComputeRMS(data, length);
        size_t num_samples = length / (kBytesPerSample * kNumChannels);
        double chunk_ms = static_cast<double>(num_samples) * 1000.0 / kSampleRate;

        GstBuffer* buffer = gst_buffer_new_allocate(nullptr, length, nullptr);
        gst_buffer_fill(buffer, 0, data, length);

        GstClockTime duration = gst_util_uint64_scale(num_samples, GST_SECOND, kSampleRate);
        GST_BUFFER_PTS(buffer) = system_pts_;
        GST_BUFFER_DURATION(buffer) = duration;
        system_pts_ += duration;

        GstFlowReturn ret = gst_app_src_push_buffer(GST_APP_SRC(system_src_), buffer);
        sys_stats_.RecordPush(chunk_ms, rms, ret == GST_FLOW_OK);
    }

    void PushMicAudio(const uint8_t* data, size_t length) {
        if (!initialized_ || !mic_src_) return;

        double rms = ComputeRMS(data, length);
        size_t num_samples = length / (kBytesPerSample * kNumChannels);
        double chunk_ms = static_cast<double>(num_samples) * 1000.0 / kSampleRate;

        GstBuffer* buffer = gst_buffer_new_allocate(nullptr, length, nullptr);
        gst_buffer_fill(buffer, 0, data, length);

        GstClockTime duration = gst_util_uint64_scale(num_samples, GST_SECOND, kSampleRate);
        GST_BUFFER_PTS(buffer) = mic_pts_;
        GST_BUFFER_DURATION(buffer) = duration;
        mic_pts_ += duration;

        GstFlowReturn ret = gst_app_src_push_buffer(GST_APP_SRC(mic_src_), buffer);
        mic_stats_.RecordPush(chunk_ms, rms, ret == GST_FLOW_OK);
    }

    std::vector<uint8_t> PullCleanMic() {
        if (!initialized_ || !output_sink_) return {};

        GstSample* sample = gst_app_sink_try_pull_sample(
            GST_APP_SINK(output_sink_), 0);
        if (!sample) {
            consecutive_empty_pulls_++;
            return {};
        }

        consecutive_empty_pulls_ = 0;

        GstBuffer* buffer = gst_sample_get_buffer(sample);
        if (!buffer) {
            gst_sample_unref(sample);
            return {};
        }

        GstMapInfo info;
        if (!gst_buffer_map(buffer, &info, GST_MAP_READ)) {
            gst_sample_unref(sample);
            return {};
        }

        std::vector<uint8_t> result(info.data, info.data + info.size);
        output_last_rms_ = ComputeRMS(info.data, info.size);
        output_pulled_++;

        gst_buffer_unmap(buffer, &info);
        gst_sample_unref(sample);

        return result;
    }

    // Relative drift between the two input streams in milliseconds.
    // If system audio is arriving faster than mic (or mic is lagging),
    // drift is positive. If mic is faster, drift is negative.
    double GetDriftMs() const {
        if (!sys_stats_.started || !mic_stats_.started) return 0.0;
        return sys_stats_.ClockOffsetMs() - mic_stats_.ClockOffsetMs();
    }

    // Drain all buffered output without copying data to caller.
    // Used when AEC is bypassed — keeps the pipeline flowing to
    // prevent backpressure while discarding the processed audio.
    void DrainOutput() {
        if (!initialized_ || !output_sink_) return;
        for (;;) {
            GstSample* sample = gst_app_sink_try_pull_sample(
                GST_APP_SINK(output_sink_), 0);
            if (!sample) {
                consecutive_empty_pulls_++;
                return;
            }
            consecutive_empty_pulls_ = 0;
            output_pulled_++;
            gst_sample_unref(sample);
        }
    }

    const StreamStats& SysStats() const { return sys_stats_; }
    const StreamStats& MicStats() const { return mic_stats_; }
    int64_t OutputPulled() const { return output_pulled_; }
    double OutputLastRms() const { return output_last_rms_; }
    int64_t ConsecutiveEmptyPulls() const { return consecutive_empty_pulls_; }

    void Destroy() {
        if (pipeline_) {
            gst_app_src_end_of_stream(GST_APP_SRC(system_src_));
            gst_app_src_end_of_stream(GST_APP_SRC(mic_src_));
            gst_element_set_state(pipeline_, GST_STATE_NULL);
            gst_object_unref(pipeline_);
            pipeline_ = nullptr;
        }
        initialized_ = false;
        system_pts_ = 0;
        mic_pts_ = 0;
    }

    bool IsInitialized() const { return initialized_; }

private:
    GstElement* pipeline_ = nullptr;
    GstElement* system_src_ = nullptr;
    GstElement* mic_src_ = nullptr;
    GstElement* echoprobe_ = nullptr;
    GstElement* webrtcdsp_ = nullptr;
    GstElement* output_sink_ = nullptr;

    GstClockTime system_pts_ = 0;
    GstClockTime mic_pts_ = 0;
    bool initialized_ = false;

    StreamStats sys_stats_{};
    StreamStats mic_stats_{};
    int64_t output_pulled_ = 0;
    double output_last_rms_ = 0.0;
    int64_t consecutive_empty_pulls_ = 0;
};

// ---- NAPI Bindings ----

static std::unique_ptr<GstAecPipeline> g_pipeline;

Napi::Value Init(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::string plugin_path;
    if (info.Length() >= 1 && info[0].IsString()) {
        plugin_path = info[0].As<Napi::String>().Utf8Value();
    }

    g_pipeline = std::make_unique<GstAecPipeline>();
    if (!g_pipeline->Init(plugin_path)) {
        g_pipeline.reset();
        Napi::Error::New(env, "Failed to initialize GStreamer AEC pipeline. "
            "Ensure gstreamer is installed and the webrtcdsp plugin is available.")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    return env.Undefined();
}

Napi::Value Destroy(const Napi::CallbackInfo& info) {
    if (g_pipeline) {
        g_pipeline->Destroy();
        g_pipeline.reset();
    }
    return info.Env().Undefined();
}

Napi::Value PushSystemAudio(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_pipeline || !g_pipeline->IsInitialized()) {
        Napi::TypeError::New(env, "AEC not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected Buffer").ThrowAsJavaScriptException();
        return env.Null();
    }
    auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
    g_pipeline->PushSystemAudio(buffer.Data(), buffer.Length());
    return env.Undefined();
}

Napi::Value PushMicAudio(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_pipeline || !g_pipeline->IsInitialized()) {
        Napi::TypeError::New(env, "AEC not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected Buffer").ThrowAsJavaScriptException();
        return env.Null();
    }
    auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
    g_pipeline->PushMicAudio(buffer.Data(), buffer.Length());
    return env.Undefined();
}

Napi::Value PullCleanMic(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_pipeline || !g_pipeline->IsInitialized()) return env.Null();

    std::vector<uint8_t> data = g_pipeline->PullCleanMic();
    if (data.empty()) return env.Null();

    return Napi::Buffer<uint8_t>::Copy(env, data.data(), data.size());
}

Napi::Value DrainOutput(const Napi::CallbackInfo& info) {
    if (g_pipeline && g_pipeline->IsInitialized()) {
        g_pipeline->DrainOutput();
    }
    return info.Env().Undefined();
}

// getStats() -> { driftMs, systemBuffers, micBuffers, outputBuffers,
//   systemOverflows, micOverflows, systemAudioMs, micAudioMs,
//   systemRms, micRms, outputRms, consecutiveEmptyPulls }
Napi::Value GetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!g_pipeline || !g_pipeline->IsInitialized()) {
        return env.Null();
    }

    const auto& sys = g_pipeline->SysStats();
    const auto& mic = g_pipeline->MicStats();

    auto obj = Napi::Object::New(env);
    obj.Set("driftMs", g_pipeline->GetDriftMs());
    obj.Set("systemBuffers", static_cast<double>(sys.buffers_pushed));
    obj.Set("micBuffers", static_cast<double>(mic.buffers_pushed));
    obj.Set("outputBuffers", static_cast<double>(g_pipeline->OutputPulled()));
    obj.Set("systemOverflows", static_cast<double>(sys.push_failures));
    obj.Set("micOverflows", static_cast<double>(mic.push_failures));
    obj.Set("systemAudioMs", sys.audio_ms);
    obj.Set("micAudioMs", mic.audio_ms);
    obj.Set("systemRms", sys.last_rms);
    obj.Set("micRms", mic.last_rms);
    obj.Set("outputRms", g_pipeline->OutputLastRms());
    obj.Set("consecutiveEmptyPulls", static_cast<double>(g_pipeline->ConsecutiveEmptyPulls()));
    return obj;
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    exports.Set("init", Napi::Function::New(env, Init));
    exports.Set("destroy", Napi::Function::New(env, Destroy));
    exports.Set("pushSystemAudio", Napi::Function::New(env, PushSystemAudio));
    exports.Set("pushMicAudio", Napi::Function::New(env, PushMicAudio));
    exports.Set("pullCleanMic", Napi::Function::New(env, PullCleanMic));
    exports.Set("drainOutput", Napi::Function::New(env, DrainOutput));
    exports.Set("getStats", Napi::Function::New(env, GetStats));
    return exports;
}

NODE_API_MODULE(raven_aec, InitModule)

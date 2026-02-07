#include "aec_api.h"

// WebRTC headers
#include "webrtc/modules/audio_processing/include/audio_processing.h"
#include "webrtc/modules/interface/module_common_types.h"

#include <cstring>
#include <cstdio>
#include <memory>

struct RavenAecProcessor {
    std::unique_ptr<webrtc::AudioProcessing> apm;
    int sample_rate;
    int stream_delay_ms;
    int num_channels;

    // Audio frames for processing
    webrtc::AudioFrame capture_frame;
    webrtc::AudioFrame render_frame;
};

RavenAecProcessor* raven_aec_create(int sample_rate) {
    if (sample_rate != 8000 && sample_rate != 16000 &&
        sample_rate != 32000 && sample_rate != 48000) {
        std::fprintf(stderr, "[AEC] Unsupported sample rate: %d\n", sample_rate);
        return nullptr;
    }

    auto* aec = new RavenAecProcessor();
    aec->sample_rate = sample_rate;
    aec->stream_delay_ms = 50;
    aec->num_channels = 1;

    webrtc::Config config;
    aec->apm.reset(webrtc::AudioProcessing::Create(config));

    if (!aec->apm) {
        std::fprintf(stderr, "[AEC] Failed to create AudioProcessing\n");
        delete aec;
        return nullptr;
    }

    auto* echo = aec->apm->echo_cancellation();
    if (echo) {
        echo->Enable(true);
        echo->set_suppression_level(webrtc::EchoCancellation::kHighSuppression);
        echo->enable_metrics(true);
        echo->enable_delay_logging(true);
    }

    auto* ns = aec->apm->noise_suppression();
    if (ns) {
        ns->Enable(true);
        ns->set_level(webrtc::NoiseSuppression::kModerate);
    }

    auto* hpf = aec->apm->high_pass_filter();
    if (hpf) {
        hpf->Enable(true);
    }

    auto* gc = aec->apm->gain_control();
    if (gc) {
        gc->Enable(true);
        gc->set_mode(webrtc::GainControl::kAdaptiveDigital);
        gc->set_target_level_dbfs(3);
    }

    webrtc::ProcessingConfig processing_config;
    processing_config.input_stream().set_sample_rate_hz(sample_rate);
    processing_config.input_stream().set_num_channels(1);
    processing_config.output_stream().set_sample_rate_hz(sample_rate);
    processing_config.output_stream().set_num_channels(1);
    processing_config.reverse_input_stream().set_sample_rate_hz(sample_rate);
    processing_config.reverse_input_stream().set_num_channels(1);
    processing_config.reverse_output_stream().set_sample_rate_hz(sample_rate);
    processing_config.reverse_output_stream().set_num_channels(1);

    int init_result = aec->apm->Initialize(processing_config);
    if (init_result != 0) {
        std::fprintf(stderr, "[AEC] Initialize error: %d\n", init_result);
    }

    aec->capture_frame.sample_rate_hz_ = sample_rate;
    aec->capture_frame.num_channels_ = 1;
    aec->capture_frame.samples_per_channel_ = sample_rate / 100;

    aec->render_frame.sample_rate_hz_ = sample_rate;
    aec->render_frame.num_channels_ = 1;
    aec->render_frame.samples_per_channel_ = sample_rate / 100;

    std::fprintf(stderr, "[AEC] Created processor (sample_rate=%d, frame_size=%d)\n",
            sample_rate, static_cast<int>(aec->capture_frame.samples_per_channel_));

    return aec;
}

void raven_aec_destroy(RavenAecProcessor* aec) {
    if (aec) {
        aec->apm.reset();
        delete aec;
        std::fprintf(stderr, "[AEC] Destroyed processor\n");
    }
}

int raven_aec_process_render(RavenAecProcessor* aec, const int16_t* samples, int num_samples) {
    if (!aec || !aec->apm || !samples) return -1;

    int expected_samples = aec->sample_rate / 100;
    if (num_samples != expected_samples) {
        std::fprintf(stderr, "[AEC] Render: expected %d samples, got %d\n", expected_samples, num_samples);
        return -2;
    }

    std::memcpy(aec->render_frame.data_, samples, num_samples * sizeof(int16_t));
    aec->render_frame.samples_per_channel_ = num_samples;

    int result = aec->apm->AnalyzeReverseStream(&aec->render_frame);
    if (result != 0) {
        std::fprintf(stderr, "[AEC] AnalyzeReverseStream error: %d\n", result);
        return result;
    }

    return 0;
}

int raven_aec_process_capture(
    RavenAecProcessor* aec,
    const int16_t* input_samples,
    int16_t* output_samples,
    int num_samples
) {
    if (!aec || !aec->apm || !input_samples || !output_samples) return -1;

    int expected_samples = aec->sample_rate / 100;
    if (num_samples != expected_samples) {
        std::fprintf(stderr, "[AEC] Capture: expected %d samples, got %d\n", expected_samples, num_samples);
        return -2;
    }

    std::memcpy(aec->capture_frame.data_, input_samples, num_samples * sizeof(int16_t));
    aec->capture_frame.samples_per_channel_ = num_samples;

    aec->apm->set_stream_delay_ms(aec->stream_delay_ms);

    int result = aec->apm->ProcessStream(&aec->capture_frame);
    if (result != 0) {
        std::fprintf(stderr, "[AEC] ProcessStream error: %d\n", result);
        std::memcpy(output_samples, input_samples, num_samples * sizeof(int16_t));
        return result;
    }

    std::memcpy(output_samples, aec->capture_frame.data_, num_samples * sizeof(int16_t));

    return 0;
}

void raven_aec_set_stream_delay(RavenAecProcessor* aec, int delay_ms) {
    if (aec) {
        aec->stream_delay_ms = delay_ms;
    }
}

void raven_aec_get_stats(RavenAecProcessor* aec, RavenAecStats* stats) {
    if (!aec || !aec->apm || !stats) return;

    std::memset(stats, 0, sizeof(RavenAecStats));
    stats->delay_ms = aec->stream_delay_ms;

    auto* echo = aec->apm->echo_cancellation();
    if (echo && echo->is_enabled()) {
        webrtc::EchoCancellation::Metrics metrics;
        if (echo->GetMetrics(&metrics) == 0) {
            stats->echo_return_loss = metrics.echo_return_loss.instant;
            stats->echo_return_loss_enhancement = metrics.echo_return_loss_enhancement.instant;
        }

        int median_delay = 0;
        int std_delay = 0;
        float fraction_poor = 0;
        if (echo->GetDelayMetrics(&median_delay, &std_delay, &fraction_poor) == 0) {
            stats->delay_ms = median_delay;
        }

        stats->diverged = echo->stream_has_echo();
    }
}

void raven_aec_reset(RavenAecProcessor* aec) {
    if (aec && aec->apm) {
        auto* echo = aec->apm->echo_cancellation();
        if (echo) {
            echo->Enable(false);
            echo->Enable(true);
        }
        std::fprintf(stderr, "[AEC] Reset filter\n");
    }
}

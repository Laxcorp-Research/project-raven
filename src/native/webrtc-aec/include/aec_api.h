#ifndef RAVEN_AEC_API_H
#define RAVEN_AEC_API_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Opaque handle to AEC processor
 */
typedef struct RavenAecProcessor RavenAecProcessor;

/**
 * AEC statistics for debugging
 */
typedef struct {
    float echo_return_loss;            // ERL in dB (higher = more echo blocked)
    float echo_return_loss_enhancement; // ERLE in dB (AEC improvement)
    int delay_ms;                      // Estimated speaker→mic delay
    bool diverged;                     // True if AEC filter diverged (needs reset)
} RavenAecStats;

/**
 * Create a new AEC processor
 * @param sample_rate Audio sample rate (must be 16000 for Deepgram)
 * @return Processor handle, or NULL on failure
 */
RavenAecProcessor* raven_aec_create(int sample_rate);

/**
 * Destroy AEC processor and free resources
 */
void raven_aec_destroy(RavenAecProcessor* aec);

/**
 * Process render (speaker/system) audio - call this with far-end audio
 * This provides the reference signal for echo cancellation
 *
 * @param aec Processor handle
 * @param samples Int16 PCM samples (mono)
 * @param num_samples Number of samples (should be 160 for 10ms at 16kHz)
 * @return 0 on success, negative on error
 */
int raven_aec_process_render(RavenAecProcessor* aec, const int16_t* samples, int num_samples);

/**
 * Process capture (microphone) audio - removes echo using render reference
 *
 * @param aec Processor handle
 * @param input_samples Input mic samples (Int16 PCM mono)
 * @param output_samples Output buffer for cleaned audio (same size as input)
 * @param num_samples Number of samples (should be 160 for 10ms at 16kHz)
 * @return 0 on success, negative on error
 */
int raven_aec_process_capture(
    RavenAecProcessor* aec,
    const int16_t* input_samples,
    int16_t* output_samples,
    int num_samples
);

/**
 * Set the estimated delay between render and capture
 * WebRTC can auto-detect this, but setting it helps convergence
 *
 * @param aec Processor handle
 * @param delay_ms Delay in milliseconds (typically 40-150ms)
 */
void raven_aec_set_stream_delay(RavenAecProcessor* aec, int delay_ms);

/**
 * Get current AEC statistics
 */
void raven_aec_get_stats(RavenAecProcessor* aec, RavenAecStats* stats);

/**
 * Reset the AEC filter (call if audio stream restarts)
 */
void raven_aec_reset(RavenAecProcessor* aec);

#ifdef __cplusplus
}
#endif

#endif // RAVEN_AEC_API_H

#ifndef AEC_BRIDGE_H
#define AEC_BRIDGE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct RavenAecProcessor RavenAecProcessor;

typedef struct {
    float echo_return_loss;
    float echo_return_loss_enhancement;
    int delay_ms;
    bool diverged;
} RavenAecStats;

RavenAecProcessor* raven_aec_create(int sample_rate);
void raven_aec_destroy(RavenAecProcessor* aec);
int raven_aec_process_render(RavenAecProcessor* aec, const int16_t* samples, int num_samples);
int raven_aec_process_capture(RavenAecProcessor* aec, const int16_t* input_samples, int16_t* output_samples, int num_samples);
void raven_aec_set_stream_delay(RavenAecProcessor* aec, int delay_ms);
void raven_aec_get_stats(RavenAecProcessor* aec, RavenAecStats* stats);
void raven_aec_reset(RavenAecProcessor* aec);

#ifdef __cplusplus
}
#endif

#endif

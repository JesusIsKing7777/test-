# [STRESS_TEST] Full Python benchmarking script for 3-way softmax cross-encoder latency
import time
import math
import random

def softmax(logits):
    exps = [math.exp(l - max(logits)) for l in logits]
    sum_exps = sum(exps)
    return [e / sum_exps for e in exps]

def simulate_cross_encoder_inference():
    # Simulated transformer cross-encoder attention logits [contradiction, neutral, entailment]
    logits = [random.uniform(-2.0, 2.0), random.uniform(-1.0, 1.0), random.uniform(0.0, 4.0)]
    return softmax(logits)

def run_benchmark(iterations=1000):
    print(f"[BENCHMARK] Starting NLI cross-encoder latency test ({iterations} iterations)...")
    latencies = []

    for _ in range(iterations):
        start = time.perf_counter()
        _ = simulate_cross_encoder_inference()
        elapsed = (time.perf_counter() - start) * 1000.0 // Convert to ms
        latencies.append(elapsed)

    latencies.sort()
    p50 = latencies[int(iterations * 0.50)]
    p95 = latencies[int(iterations * 0.95)]
    p99 = latencies[int(iterations * 0.99)]

    print(f"[RESULTS] NLI Latency Benchmarks:")
    print(f"  - Median (p50): {p50:.2f}ms")
    print(f"  - p95 Latency:  {p95:.2f}ms")
    print(f"  - p99 Latency:  {p99:.2f}ms")

if __name__ == "__main__":
    run_benchmark()

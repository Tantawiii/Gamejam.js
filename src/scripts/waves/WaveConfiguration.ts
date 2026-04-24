/**
 * WAVECONFIGURATION.TS - Defines wave structure and difficulty progression
 * 
 * PURPOSE:
 * Centralized configuration for all waves. Defines what enemies spawn in each wave,
 * how many, and in what order. This makes it easy to balance difficulty progression
 * and adjust game feel without touching the core wave system code.
 * 
 * WAVE STRUCTURE:
 * - Each wave has fixed enemy specifications
 * - Enemy specs define type and count
 * - Wave multiplier scales difficulty (1.2x per wave)
 * - Spawn interval controls tempo of enemy release
 * 
 * PROGRESSION PHILOSOPHY:
 * - Basic spawns remap to bombs in WaveSystem
 * - Chunky enemies only appear once player level ≥ 3; long-range once level ≥ 5
 * - Each wave harder than last via multiplier
 * - Mix gradually changes based on design decisions
 */

export type EnemyType = 'basic' | 'bomb' | 'chunky' | 'long_range';

export interface EnemySpec {
  type: EnemyType;
  count: number;
}

export interface WaveConfig {
  waveNumber: number;
  baseEnemies: EnemySpec[];
  spawnIntervalMs: number;
}

/**
 * Generate wave configuration with difficulty scaling
 * @param baseWave Base wave specs before multiplier
 * @param waveNumber Current wave number
 * @param difficultyMultiplier How much to scale per wave (1.2 = 20% harder)
 */
function generateWaveConfig(
  baseWave: EnemySpec[],
  waveNumber: number,
  difficultyMultiplier: number,
): EnemySpec[] {
  const multiplier = Math.pow(difficultyMultiplier, waveNumber - 1);
  return baseWave.map(spec => ({
    ...spec,
    count: Math.ceil(spec.count * multiplier),
  }));
}

/**
 * Get the configuration for a specific wave
 * @param waveNumber 1-indexed wave number
 * @param difficultyMultiplier Scales difficulty per wave (default 1.2)
 */
export function getWaveConfig(
  waveNumber: number,
  difficultyMultiplier: number = 1.2,
): WaveConfig {
  // Base wave configs before multiplier
  const baseConfigs: Record<number, EnemySpec[]> = {
    1: [
      { type: 'bomb', count: 20 },
      { type: 'long_range', count: 10 },
    ],
    2: [
      { type: 'bomb', count: 25 },
      { type: 'long_range', count: 15 },
    ],
    3: [
      { type: 'bomb', count: 28 },
      { type: 'long_range', count: 12 },
    ],
    4: [
      { type: 'bomb', count: 22 },
      { type: 'long_range', count: 12 },
      { type: 'chunky', count: 8 },
    ],
    5: [
      { type: 'bomb', count: 18 },
      { type: 'chunky', count: 10 },
      { type: 'long_range', count: 15 },
    ],
    6: [
      { type: 'bomb', count: 22 },
      { type: 'chunky', count: 12 },
      { type: 'long_range', count: 18 },
    ],
  };

  // Get base config or default to repeating wave 6 pattern
  const baseConfig = baseConfigs[waveNumber] || baseConfigs[6]!;

  // Apply difficulty multiplier
  const scaledEnemies = generateWaveConfig(baseConfig, waveNumber, difficultyMultiplier);

  return {
    waveNumber,
    baseEnemies: scaledEnemies,
    spawnIntervalMs: 200, // Spawn one enemy every 200ms
  };
}

/**
 * Get configuration for between-wave settings
 */
export interface BetweenWaveConfig {
  delayBeforeNextWaveMs: number;
}

export function getBetweenWaveConfig(): BetweenWaveConfig {
  return {
    delayBeforeNextWaveMs: 3000, // 3 seconds between waves
  };
}

/**
 * Per-church playback configuration: where the impulse responses and panoramas
 * live, where the camera should point at each receiver, and how much each
 * receiver's reverb needs trimming.
 *
 * Everything that used to differ between the twelve CompileSelection* functions
 * is a value in this table. compile() in App.js reads it; nothing here touches
 * the DOM.
 *
 * @author Kritan Duwal
 */

/**
 * ir.dir + "/" + (receiver.irName || ir.prefix + "_" + receiverId) + "-"
 *     gives the base path of an IR pair; AudioEngine appends "1.wav" / "2.wav".
 * panorama.dir + "/" + panorama.prefix + "_" + receiverId + panorama.ext
 *     gives the 360 photo. Extensions are case-sensitive once deployed, so they
 *     are spelled here exactly as the files are named on disk.
 * trim
 *     per-church output levels for the render modes that are not plain stereo,
 *     in dB. Negative is quieter; zero leaves the stage at whatever level its
 *     own processing produced, which is where every church starts. Each key
 *     replaces that stage's constant in AudioEngine.js outright — it is the
 *     level the stage runs at, not an adjustment to one — so two churches can
 *     be read against each other directly:
 *
 *         trim: { binaural: 0, brir: 0, ambisonic: 0 }              uncalibrated
 *         trim: { binaural: 1, brir: -17.8, ambisonic: -20 }        calibrated
 *
 *     Decibels because the ear hears ratios: 3 dB is the same size step
 *     wherever it is taken. Most values take level off, but the binaural render
 *     lands slightly under stereo and wants a small boost, so the range runs
 *     both ways and is bounded at -40 and +12 dB.
 *
 *     The three land far apart because the stages are not built the same way:
 *     the impulse-response convolvers normalize and the HRIR ones deliberately
 *     do not, so the BRIR and ambisonic stages carry the whole gain of the
 *     offline decode. Expect about +1 dB for binaural against -15 to -22 dB for
 *     the others. tools/measure-loudness.js derives all three.
 *
 *     Measured rather than guessed: tools/measure-loudness.js renders every
 *     mode through the same chain the engine builds and matches their ITU-R
 *     BS.1770 loudness to stereo's. Run it with --write to refresh these.
 * receivers[id].pitch / .yaw
 *     camera angles handed to pannellum's lookAt(), in degrees. Every position
 *     spells both out, including the zeroes, so that a straight-ahead view
 *     reads as a decision rather than as a missing value.
 * receivers[id].gainDb
 *     pre-fader reduction for that position's reverb, in dB. Omitted where the
 *     position plays back as recorded. See "Reverb ratios" in README.md for how
 *     these were derived and where they are applied.
 */
const ROOMS = {
    BridgeCommunityChurch: {
        ir:       { dir: "IR/Bridge Community Church", prefix: "Bridge Church" },
        panorama: { dir: "Images/Bridge Community Church", prefix: "Bridge Community Church", ext: ".jpg" },
        trim:     { binaural: 0.8, brir: -17.8, ambisonic: -20 },
        receivers: {
            R1: { pitch: 0, yaw: 180 },
            R2: { pitch: 0, yaw: 180 },
            R3: { pitch: 0, yaw: 190 },
            R4: { pitch: 0, yaw: 170 }
        }
    },

    ChristChurchCathedral: {
        ir:       { dir: "IR/Christ Church Cathedral", prefix: "Christ Church Cathedral" },
        panorama: { dir: "Images/Christ Church Cathedral", prefix: "Christ Church Cathedral", ext: ".jpg" },
        trim:     { binaural: 0.9, brir: -16.5, ambisonic: -18.7 },
        receivers: {
            R1: { pitch: 0, yaw: 180 },
            R2: { pitch: 0, yaw: 180 },
            R3: { pitch: 0, yaw: 180 },
            R4: { pitch: 0, yaw: 210 },
            R5: { pitch: 0, yaw: 210 },
            R6: { pitch: 0, yaw: 150 },
            R7: { pitch: 0, yaw: 150 },
            R8: { pitch: 0, yaw: 180 }
        }
    },

    DowntownPresbyterianChurch: {
        ir:       { dir: "IR/Downtown Presbyterian Church", prefix: "Downtown Presbyterian" },
        panorama: { dir: "Images/Downtown Presbyterian Church", prefix: "Downtown Presbyterian Church", ext: ".jpg" },
        trim:     { binaural: 0.8, brir: -17.4, ambisonic: -19.5 },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0 },
            R3: { pitch: 0, yaw: 0 },
            R4: { pitch: 0, yaw: 0 },
            R5: { pitch: 0, yaw: 0 }
        }
    },

    FirstBaptistChurchCapitolHill: {
        ir:       { dir: "IR/First Baptist Church Capitol Hill", prefix: "First Baptist Church" },
        panorama: { dir: "Images/First Baptist Church Capitol Hill", prefix: "First Baptist Church Capitol Hill", ext: ".jpg" },
        trim:     { binaural: 0.8, brir: -19.4, ambisonic: -21.7 },
        receivers: {
            R1: { pitch: 0, yaw: 180 },
            R2: { pitch: 0, yaw: 180 },
            R3: { pitch: 0, yaw: 180 },
            R4: { pitch: 0, yaw: 150 },
            R5: { pitch: 0, yaw: 210 }
        }
    },

    HolyTrinityEpiscopalChurch: {
        ir:       { dir: "IR/Holy Trinity Episcopal Church", prefix: "Holy Trinity Church" },
        panorama: { dir: "Images/Holy Trinity Episcopal Church", prefix: "Holy Trinity Episcopal Church", ext: ".jpg" },
        trim:     { binaural: 0.9, brir: -20.2, ambisonic: -22.6 },
        receivers: {
            R1: { pitch: 0, yaw: 180 },
            R2: { pitch: 0, yaw: 180 },
            R3: { pitch: 0, yaw: 180 },
            R4: { pitch: 0, yaw: 180 }
        }
    },

    UnitedMethodistChurch: {
        ir:       { dir: "IR/Church Street United Methodist Church, Knoxville", prefix: "Church Street United" },
        panorama: { dir: "Images/Church Street United Methodist Church, Knoxville", prefix: "Church Street United Methodist Church", ext: ".jpg" },
        trim:     { binaural: 0.8, brir: -18.7, ambisonic: -21 },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0 },
            R3: { pitch: 0, yaw: 0 },
            R4: { pitch: 0, yaw: 0 }
        }
    },

    CaneRidgeMeetingHouse: {
        ir:       { dir: "IR/Cane Ridge Meeting House, KY", prefix: "Cane Ridge KY" },
        panorama: { dir: "Images/Cane Ridge Meeting House, KY", prefix: "Cane Ridge Meeting House, KY", ext: ".jpg" },
        trim:     { binaural: 1, brir: -18.5, ambisonic: -20.9 },
        receivers: {
            R1: { pitch:   0, yaw: 4 },
            R2: { pitch:   0, yaw: 0 },
            R3: { pitch:   0, yaw: 0 },
            R4: { pitch:   0, yaw: 0 },
            R5: { pitch:   0, yaw: 0, gainDb:   3 },
            R6: { pitch:   0, yaw: 0, gainDb:   3 },
            R7: { pitch: -15, yaw: 0, gainDb: 1.5 },
            R8: { pitch: -15, yaw: 0, gainDb: 1.5 },
            R9: { pitch: -15, yaw: 0, gainDb: 1.5 }
        }
    },

    FirstPresbyterianChurchKY: {
        ir:       { dir: "IR/First Presbyterian Church, KY", prefix: "FPC KY" },
        panorama: { dir: "Images/First Presbyterian Church, KY", prefix: "First Presbyterian Church, KY", ext: ".jpg" },
        trim:     { binaural: 0.6, brir: -16.3, ambisonic: -18.7 },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0, gainDb: 1.5 },
            R3: { pitch: 0, yaw: 0, gainDb:   3 },
            R4: { pitch: 0, yaw: 0 },
            R5: { pitch: 0, yaw: 0, gainDb: 1.5 },
            R6: { pitch: 0, yaw: 0, gainDb:   3 },
            R7: { pitch: 0, yaw: 0 },
            R8: { pitch: 0, yaw: 0, gainDb: 1.5 },
            R9: { pitch: 0, yaw: 0, gainDb:   3 }
        }
    },

    BasilicaStFrancis: {
        ir:       { dir: "IR/Basilica St. Francis, IN", prefix: "St Francis_IN" },
        panorama: { dir: "Images/Basilica St. Francis, IN", prefix: "St Francis_IN", ext: ".JPG" },
        trim:     { binaural: 0.7, brir: -18.6, ambisonic: -21.3 },
        receivers: {
            R1: { pitch:   0, yaw: 1 },
            R2: { pitch:  -2, yaw: 4, gainDb: 1.5 },
            R3: { pitch:  -2, yaw: 3, gainDb:   3 },
            R4: { pitch:   0, yaw: 0, gainDb:   1 },
            R5: { pitch:   0, yaw: 0, gainDb:   1 },
            R6: { pitch:   0, yaw: 0, gainDb: 2.5 },
            R7: { pitch:   0, yaw: 0, gainDb: 2.5 },
            // The balcony recordings were filed under their own name rather than
            // following the prefix_receiver pattern used everywhere else.
            R8: { pitch: -15, yaw: 0, gainDb: 4.5, irName: "St Francis_IN_balcony R8" }
        }
    },

    MonasteryImmaculateConception: {
        ir:       { dir: "IR/Monastery Immaculate Conception, IN", prefix: "MIC_IN" },
        panorama: { dir: "Images/Monastery Immaculate Conception, IN", prefix: "MIC_IN", ext: ".JPG" },
        trim:     { binaural: 0.5, brir: -15.4, ambisonic: -17.9 },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0, gainDb: 1.5 },
            R3: { pitch: 0, yaw: 0, gainDb:   3 },
            R4: { pitch: 0, yaw: 0, gainDb: 4.5 },
            R5: { pitch: 0, yaw: 0, gainDb: 1.5 },
            R6: { pitch: 0, yaw: 0, gainDb: 1.5 }
        }
    },

    OurLadyOfGuadalupe: {
        ir:       { dir: "IR/Our Lady of Guadalupe, NM", prefix: "Guadalupe_SantaFe" },
        panorama: { dir: "Images/Our Lady of Guadalupe, NM", prefix: "Guadalupe_SantaFe", ext: ".JPG" },
        trim:     { binaural: 0.9, brir: -16.3, ambisonic: -18.5 },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0, gainDb: 1.5 },
            R3: { pitch: 0, yaw: 0, gainDb:   3 },
            R4: { pitch: 0, yaw: 0, gainDb: 4.5 },
            R5: { pitch: 0, yaw: 0 },
            R6: { pitch: 0, yaw: 0 }
        }
    },

    StAugustineIsleta: {
        ir:       { dir: "IR/St Augustine Isleta, NM", prefix: "St Augustine_Isleta" },
        panorama: { dir: "Images/St Augustine Isleta, NM", prefix: "St Augustine_Isleta", ext: ".JPG" },
        trim:     { binaural: 0.7, brir: -21.4, ambisonic: -23.7 },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0, gainDb: 1.5 },
            R3: { pitch: 0, yaw: 0, gainDb:   3 },
            R4: { pitch: 0, yaw: 0, gainDb: 4.5 },
            R5: { pitch: 0, yaw: 0, gainDb:   6 }
        }
    }
};

/**
 * Pulls the receiver id out of a button element id, e.g. "rpR3_CaneRidge..." -> "R3"
 * @returns {string} the receiver id, or "" if the element id is not a receiver button
 */
function receiverIdOf(elementId) {
    const match = /^rp(R\d+)_/.exec(elementId || "");
    return match ? match[1] : "";
}

/**
 * Base path of a receiver's impulse response pair. AudioEngine appends the
 * channel number, so this deliberately ends in the trailing "-".
 */
function impulseResponseBase(config, receiverId) {
    const stem = config.receivers[receiverId].irName || `${config.ir.prefix}_${receiverId}`;
    return `${config.ir.dir}/${stem}-`;
}

/**
 * Path of the 360 photo taken at a receiver position
 */
function panoramaPath(config, receiverId) {
    const { dir, prefix, ext } = config.panorama;
    return `${dir}/${prefix}_${receiverId}${ext}`;
}

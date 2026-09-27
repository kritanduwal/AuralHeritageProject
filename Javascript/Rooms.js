/**
 * Per-church playback configuration: where the impulse responses and panoramas
 * live, where the camera should point at each receiver, and how much each
 * receiver's reverb needs trimming.
 *
 * compile() in App.js reads it; nothing here touches the DOM.
 *
 * @author Kritan Duwal
 */

/**
 * What the path helpers at the foot of this file do not already spell out:
 *
 * panorama.ext
 *     case-sensitive once deployed, so spelled as the file is named on disk.
 * soundfieldYaw
 *     panorama yaw, in degrees, at which the recording's own front points; half
 *     this collection is 180 out, which reverses which ear a source moves
 *     toward. Omitted where the two already agree. Reaches the headphone render
 *     only — stereo bakes its orientation in. Found by ear: turn the view and
 *     check a source crosses to the opposite ear rather than following you.
 * unnormalized
 *     the original captures, present only where recovered, and the only thing
 *     the headphone render decodes — its button is dead without them. A decode
 *     sums the four capsules and so needs their relative levels intact; the
 *     published library's were each peak-normalized, so decoding those would
 *     point sound in directions nobody recorded. Stereo never reads this and so
 *     stays the reference the render is trimmed against.
 *
 *     trim   { ambisonic: { R1: -15.6, … } } — a signed level in dB, negative
 *            quieter, bounded at -40 and +12. It scales the decoded room and
 *            not the dry path, which is the identical signal in both stages and
 *            skips the decoder. Per receiver, because stereo was normalized per
 *            position while the recovered set was scaled as a whole: one figure
 *            per church leaves front rows clipping and back rows inaudible.
 *            Corrected here rather than in the files, which would destroy the
 *            between-seat relationships the set exists for. Derived by
 *            tools/measure-loudness.js --write.
 * receivers[id].pitch / .yaw
 *     pannellum lookAt() angles in degrees, zeroes spelled out so a
 *     straight-ahead view reads as a decision rather than a missing value.
 * receivers[id].gainDb
 *     pre-fader level for that position's reverb, in dB, signed like `trim`.
 *     Omitted where the position plays back as recorded.
 */
const ROOMS = {
    BridgeCommunityChurch: {
        ir:       { dir: "IR/Bridge Community Church/Normalized", prefix: "Bridge Church" },
        panorama: { dir: "Images/Bridge Community Church", prefix: "Bridge Community Church", ext: ".jpg" },
        receivers: {
            R1: { pitch: 0, yaw: 180 },
            R2: { pitch: 0, yaw: 180 },
            R3: { pitch: 0, yaw: 190 },
            R4: { pitch: 0, yaw: 170 }
        }
    },

    ChristChurchCathedral: {
        ir:       { dir: "IR/Christ Church Cathedral/Normalized", prefix: "Christ Church Cathedral" },
        panorama: { dir: "Images/Christ Church Cathedral", prefix: "Christ Church Cathedral", ext: ".jpg" },
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
        ir:       { dir: "IR/Downtown Presbyterian Church/Normalized", prefix: "Downtown Presbyterian" },
        panorama: { dir: "Images/Downtown Presbyterian Church", prefix: "Downtown Presbyterian Church", ext: ".jpg" },
        soundfieldYaw: 180,
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0 },
            R3: { pitch: 0, yaw: 0 },
            R4: { pitch: 0, yaw: 0 },
            R5: { pitch: 0, yaw: 0 }
        }
    },

    FirstBaptistChurchCapitolHill: {
        ir:       { dir: "IR/First Baptist Church Capitol Hill/Normalized", prefix: "First Baptist Church" },
        panorama: { dir: "Images/First Baptist Church Capitol Hill", prefix: "First Baptist Church Capitol Hill", ext: ".jpg" },
        receivers: {
            R1: { pitch: 0, yaw: 180 },
            R2: { pitch: 0, yaw: 180 },
            R3: { pitch: 0, yaw: 180 },
            R4: { pitch: 0, yaw: 150 },
            R5: { pitch: 0, yaw: 210 }
        }
    },

    HolyTrinityEpiscopalChurch: {
        ir:       { dir: "IR/Holy Trinity Episcopal Church/Normalized", prefix: "Holy Trinity Church" },
        panorama: { dir: "Images/Holy Trinity Episcopal Church", prefix: "Holy Trinity Episcopal Church", ext: ".jpg" },
        receivers: {
            R1: { pitch: 0, yaw: 180 },
            R2: { pitch: 0, yaw: 180 },
            R3: { pitch: 0, yaw: 180 },
            R4: { pitch: 0, yaw: 180 }
        }
    },

    UnitedMethodistChurch: {
        ir:       { dir: "IR/Church Street United Methodist Church, Knoxville/Normalized", prefix: "Church Street United" },
        panorama: { dir: "Images/Church Street United Methodist Church, Knoxville", prefix: "Church Street United Methodist Church", ext: ".jpg" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/Church Street United Methodist Church, Knoxville/Not Normalized", prefix: "Church Street United" },
            trim: { ambisonic: { R1: -7.1, R2: -1.8, R3: -0.4, R4: 1.9 } },
            // Direct sound at -34 to -42° across all four, as the recovered
            // sets elsewhere; the half turn would put the source behind.
            soundfieldYaw: 0,
        },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0 },
            R3: { pitch: 0, yaw: 0 },
            R4: { pitch: 0, yaw: 0 }
        }
    },

    CaneRidgeMeetingHouse: {
        ir:       { dir: "IR/Cane Ridge Meeting House, KY/Normalized", prefix: "Cane Ridge KY" },
        panorama: { dir: "Images/Cane Ridge Meeting House, KY", prefix: "Cane Ridge Meeting House, KY", ext: ".jpg" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/Cane Ridge Meeting House, KY/Not Normalized", prefix: "Cane Ridge KY" },
            trim: { ambisonic: { R1: -12.2, R2: -9.5, R3: -8.8, R4: -9.4, R5: 6.1, R6: 5.9, R7: -6.3, R8: -2.1, R9: -3.5 } },
            // Direct sound at -35 to -41° across all nine, taken at the first
            // arrival: the balcony's loudest peak is the floor reflection.
            soundfieldYaw: 0,
        },
        receivers: {
            R1: { pitch:   0, yaw: 4 },
            R2: { pitch:   0, yaw: 0 },
            R3: { pitch:   0, yaw: 0 },
            R4: { pitch:   0, yaw: 0 },
            R5: { pitch:   0, yaw: 0, gainDb:   -3 },
            R6: { pitch:   0, yaw: 0, gainDb:   -3 },
            R7: { pitch: -15, yaw: 0, gainDb: -1.5 },
            R8: { pitch: -15, yaw: 0, gainDb: -1.5 },
            R9: { pitch: -15, yaw: 0, gainDb: -1.5 }
        }
    },

    FirstPresbyterianChurchKY: {
        ir:       { dir: "IR/First Presbyterian Church, KY/Normalized", prefix: "FPC KY" },
        panorama: { dir: "Images/First Presbyterian Church, KY", prefix: "First Presbyterian Church, KY", ext: ".jpg" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/First Presbyterian Church, KY/Not Normalized", prefix: "FPC KY" },
            trim: { ambisonic: { R1: -6.1, R2: -3.7, R3: -2.5, R4: -4, R5: -1.2, R6: -0.1, R7: -4.7, R8: -2.2, R9: -1.8 } },
            // Direct sound at -40 to -44° across all nine, as above.
            soundfieldYaw: 0,
        },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0, gainDb: -1.5 },
            R3: { pitch: 0, yaw: 0, gainDb:   -3 },
            R4: { pitch: 0, yaw: 0 },
            R5: { pitch: 0, yaw: 0, gainDb: -1.5 },
            R6: { pitch: 0, yaw: 0, gainDb:   -3 },
            R7: { pitch: 0, yaw: 0 },
            R8: { pitch: 0, yaw: 0, gainDb: -1.5 },
            R9: { pitch: 0, yaw: 0, gainDb:   -3 }
        }
    },

    BasilicaStFrancis: {
        ir:       { dir: "IR/Basilica St. Francis, IN/Normalized", prefix: "St Francis_IN" },
        panorama: { dir: "Images/Basilica St. Francis, IN", prefix: "St Francis_IN", ext: ".JPG" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/Basilica St. Francis, IN/Not Normalized", prefix: "St Francis_IN" },
            trim: { ambisonic: { R1: -15.6, R2: -10, R3: -8.4, R4: -6, R5: -5.9, R6: -5.4, R7: -5.6, R8: -5.2 } },
            // Direct sound at -39 to -43° across all eight: the fronts already
            // agree. Confirmed by ear.
            soundfieldYaw: 0,
        },
        receivers: {
            R1: { pitch:   0, yaw: 1 },
            R2: { pitch:  -2, yaw: 4, gainDb: -1.5 },
            R3: { pitch:  -2, yaw: 3, gainDb:   -3 },
            R4: { pitch:   0, yaw: 0, gainDb:   -1 },
            R5: { pitch:   0, yaw: 0, gainDb:   -1 },
            R6: { pitch:   0, yaw: 0, gainDb: -2.5 },
            R7: { pitch:   0, yaw: 0, gainDb: -2.5 },
            // Filed under its own name, not the prefix_receiver pattern
            R8: { pitch: -15, yaw: 0, gainDb: -4.5, irName: "St Francis_IN_balcony R8" }
        }
    },

    MonasteryImmaculateConception: {
        ir:       { dir: "IR/Monastery Immaculate Conception, IN/Normalized", prefix: "MIC_IN" },
        panorama: { dir: "Images/Monastery Immaculate Conception, IN", prefix: "MIC_IN", ext: ".JPG" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/Monastery Immaculate Conception, IN/Not Normalized", prefix: "MIC_IN" },
            trim: { ambisonic: { R1: -5.6, R2: 1, R3: 2.7, R4: 3.8, R5: 2.2, R6: 3 } },
            // Direct sound at -39° across all six, so the fronts agree; the
            // church's half turn on top would put the source behind the
            // listener, where lateral motion runs backwards.
            soundfieldYaw: 0,
        },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0, gainDb: -1.5 },
            R3: { pitch: 0, yaw: 0, gainDb:   -3 },
            R4: { pitch: 0, yaw: 0, gainDb: -4.5 },
            R5: { pitch: 0, yaw: 0, gainDb: -1.5 },
            R6: { pitch: 0, yaw: 0, gainDb: -1.5 }
        }
    },

    OurLadyOfGuadalupe: {
        ir:       { dir: "IR/Our Lady of Guadalupe, NM/Normalized", prefix: "Guadalupe_SantaFe" },
        panorama: { dir: "Images/Our Lady of Guadalupe, NM", prefix: "Guadalupe_SantaFe", ext: ".JPG" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/Our Lady of Guadalupe, NM/Not Normalized", prefix: "Guadalupe_SantaFe" },
            trim: { ambisonic: { R1: -13.7, R2: -10.7, R3: -11, R4: -9.6, R5: -9.9, R6: -8.4 } },
            // Direct sound at -37 to -41° at R1–R5. R6 reads 136° even at the
            // first arrival, half a turn from the rest; not confirmed by ear.
            soundfieldYaw: 0,
        },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0, gainDb: -1.5 },
            R3: { pitch: 0, yaw: 0, gainDb:   -3 },
            R4: { pitch: 0, yaw: 0, gainDb: -4.5 },
            R5: { pitch: 0, yaw: 0 },
            R6: { pitch: 0, yaw: 0 }
        }
    },

    StAugustineIsleta: {
        ir:       { dir: "IR/St Augustine Isleta, NM/Normalized", prefix: "St Augustine_Isleta" },
        panorama: { dir: "Images/St Augustine Isleta, NM", prefix: "St Augustine_Isleta", ext: ".JPG" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/St Augustine Isleta, NM/Not Normalized", prefix: "St Augustine_Isleta" },
            trim: { ambisonic: { R1: -16.3, R2: -11.5, R3: -10.5, R4: -8.8, R5: -7.8 } },
            // Direct sound at -40 to -41° across all five, as above.
            soundfieldYaw: 0,
        },
        receivers: {
            R1: { pitch: 0, yaw: 0 },
            R2: { pitch: 0, yaw: 0, gainDb: -1.5 },
            R3: { pitch: 0, yaw: 0, gainDb:   -3 },
            R4: { pitch: 0, yaw: 0, gainDb: -4.5 },
            R5: { pitch: 0, yaw: 0, gainDb:   -6 }
        }
    }
};

/** "rpR3_CaneRidge…" -> "R3", or "" where the id is not a receiver button */
function receiverIdOf(elementId) {
    const match = /^rp(R\d+)_/.exec(elementId || "");
    return match ? match[1] : "";
}

/**
 * The set the headphone render decodes, or null where a church has none. Null
 * rather than falling back to the published library: that decode would sound
 * spatial, point sound in directions nobody recorded, and not sound broken.
 */
function decodedSourceOf(config) {
    return config.unnormalized || null;
}

/**
 * Which panorama yaw the soundfield calls forward, read off the recovered set.
 * The church's own value cannot be inherited blindly: it was found by ear
 * against a decode whose directions are invalid, so it records whatever offset
 * made a broken soundfield sit least wrong.
 */
function soundfieldYawOf(config) {
    const decoded = decodedSourceOf(config);
    const yaw = decoded && decoded.soundfieldYaw;
    return Number.isFinite(yaw) ? yaw : (config.soundfieldYaw || 0);
}

/**
 * Output level for one receiver, keyed by stage name — the shape stageTrims
 * wants. A position with no entry falls back to 0 dB and so plays untrimmed,
 * which assets.test.js exists to prevent.
 */
function stageTrimsOf(config, receiverId) {
    const decoded = decodedSourceOf(config);
    if (!decoded) return {};

    const perPosition = decoded.trim.ambisonic;
    const db = perPosition && perPosition[receiverId];
    return Number.isFinite(db) ? { ambisonic: db } : {};
}

/**
 * Base path of a receiver's files within a set, ending in the "-" AudioEngine
 * completes with a channel number or suffix. The stem comes from the church,
 * not the set: both inherit `irName`.
 */
function responseBaseIn(source, config, receiverId) {
    const stem = config.receivers[receiverId].irName || `${source.ir.prefix}_${receiverId}`;
    return `${source.ir.dir}/${stem}-`;
}

/** The stereo pair, channels 1 and 2. Always the published library. */
function impulseResponseBase(config, receiverId) {
    return responseBaseIn(config, config, receiverId);
}

/**
 * The B-format file, or "" where there is no recovered set — ambisonicAvailable()
 * reads the empty string to keep the button dead without a fetch that would 404.
 */
function decodedResponseBase(config, receiverId) {
    const decoded = decodedSourceOf(config);
    return decoded ? responseBaseIn(decoded, config, receiverId) : "";
}

/** Path of the 360 photo taken at a receiver position */
function panoramaPath(config, receiverId) {
    const { dir, prefix, ext } = config.panorama;
    return `${dir}/${prefix}_${receiverId}${ext}`;
}

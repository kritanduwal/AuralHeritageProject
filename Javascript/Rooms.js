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
 *
 *         IR/<Church>/Normalized/        the published library, always present
 *         IR/<Church>/Not Normalized/    the original captures, where recovered
 *
 *     Two folders because the sets hold the same measurement at two levellings,
 *     under identical file names.
 * panorama.dir + "/" + panorama.prefix + "_" + receiverId + panorama.ext
 *     gives the 360 photo. Extensions are case-sensitive once deployed, so they
 *     are spelled here exactly as the files are named on disk.
 * soundfieldYaw
 *     the panorama yaw, in degrees, at which the ambisonic recording's own
 *     front points. Omitted where the two already agree.
 *
 *     The array's front axis is wherever it was set down, the panorama's zero
 *     wherever the camera started; half this collection differs by 180 degrees.
 *     Head tracking turns the soundfield by the camera's bearing, so half a turn
 *     out reverses which ear a source moves toward. Found by ear: turn the view
 *     and check a source crosses to the opposite ear rather than following you.
 *
 *     Reaches the headphone render only; stereo bakes its orientation in.
 * unnormalized
 *     this church's original captures, present only where recovered.
 *
 *     The headphone render reads this and nothing else, so its button is dead
 *     without it. A decode sums the four capsules, which needs their relative
 *     levels intact; the published library's were each peak-normalized, so a
 *     decode of them would point sound in directions nobody recorded. See "Why
 *     not an ambisonic decode" in README.md.
 *
 *     Stereo never reads it, and so stays the reference the render is trimmed
 *     against. Receivers and panoramas are not repeated: the recovery did not
 *     change the room.
 *
 *         ir             where the recovered set lives
 *         trim           { ambisonic: { R1: -17.6, R2: -7.4, … } }, in dB,
 *                        replacing AMBISONIC_TRIM_DB outright. Bounded at -40
 *                        and +12 dB.
 *
 *                        Per receiver, and the spread is wide: St Francis runs
 *                        -17.6 dB at R1 to -3.3 at R4. The published capsules
 *                        were normalized per position, so stereo does not get
 *                        quieter with distance; the recovered set was scaled as
 *                        a whole, so it does. One figure per church leaves the
 *                        front rows clipping and the back rows inaudible.
 *
 *                        Corrected here rather than in the files: rescaling each
 *                        position's B-format would destroy the between-seat
 *                        relationships the set exists for. Derived by
 *                        tools/measure-loudness.js --write.
 *         soundfieldYaw  optional; see soundfieldYawOf(). Omit where the
 *                        recovered set agrees with the church.
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
        ir:       { dir: "IR/First Presbyterian Church, KY/Normalized", prefix: "FPC KY" },
        panorama: { dir: "Images/First Presbyterian Church, KY", prefix: "First Presbyterian Church, KY", ext: ".jpg" },
        soundfieldYaw: 180,
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
        ir:       { dir: "IR/Basilica St. Francis, IN/Normalized", prefix: "St Francis_IN" },
        panorama: { dir: "Images/Basilica St. Francis, IN", prefix: "St Francis_IN", ext: ".JPG" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/Basilica St. Francis, IN/Not Normalized", prefix: "St Francis_IN" },
            trim: { ambisonic: { R1: -17.6, R2: -7.4, R3: -6.1, R4: -3.3, R5: -4.7, R6: -6.7, R7: -5.4, R8: -3.5 } },
            // Direct sound at azimuth -39 to -43 deg across all eight
            // positions: the array's front and the panorama's agree already.
            // Confirmed by ear.
            soundfieldYaw: 0,
        },
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
        ir:       { dir: "IR/Monastery Immaculate Conception, IN/Normalized", prefix: "MIC_IN" },
        panorama: { dir: "Images/Monastery Immaculate Conception, IN", prefix: "MIC_IN", ext: ".JPG" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/Monastery Immaculate Conception, IN/Not Normalized", prefix: "MIC_IN" },
            trim: { ambisonic: { R1: -4, R2: 3.8, R3: 2.7, R4: 4.2, R5: 1.9, R6: 2.4 } },
            // Direct sound at azimuth -39 deg across all six positions, so
            // the two fronts agree already. The church's half turn on top would
            // render the source behind the listener, where lateral motion runs
            // backwards. Confirmed by ear.
            soundfieldYaw: 0,
        },
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
        ir:       { dir: "IR/Our Lady of Guadalupe, NM/Normalized", prefix: "Guadalupe_SantaFe" },
        panorama: { dir: "Images/Our Lady of Guadalupe, NM", prefix: "Guadalupe_SantaFe", ext: ".JPG" },
        soundfieldYaw: 180,
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
        ir:       { dir: "IR/St Augustine Isleta, NM/Normalized", prefix: "St Augustine_Isleta" },
        panorama: { dir: "Images/St Augustine Isleta, NM", prefix: "St Augustine_Isleta", ext: ".JPG" },
        soundfieldYaw: 180,
        unnormalized: {
            ir:   { dir: "IR/St Augustine Isleta, NM/Not Normalized", prefix: "St Augustine_Isleta" },
            trim: { ambisonic: { R1: -14.1, R2: -9.8, R3: -9.3, R4: -2.3, R5: -5.4 } },
            // Direct sound at azimuth -40 to -41 deg across all five
            // positions, as above. Confirmed by ear.
            soundfieldYaw: 0,
        },
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
 * Which set of files the headphone render decodes.
 *
 * Null rather than a fallback to the published library: a decode of those
 * capsules would sound spatial while pointing sound in directions nobody
 * recorded, and nothing about it would sound broken. See `unnormalized` above.
 *
 * @returns the recovered set, or null for a church that has none
 */
function decodedSourceOf(config) {
    return config.unnormalized || null;
}

/**
 * Which panorama yaw the soundfield calls forward.
 *
 * Read off the recovered set, which is the only thing the render plays. The
 * church's own value cannot be inherited blindly: it was found by ear against a
 * decode whose directions are invalid, so it records whatever offset made a
 * broken soundfield sit least wrong. Falls back to it where the set agrees.
 */
function soundfieldYawOf(config) {
    const decoded = decodedSourceOf(config);
    const yaw = decoded && decoded.soundfieldYaw;
    return Number.isFinite(yaw) ? yaw : (config.soundfieldYaw || 0);
}

/**
 * Output level for the headphone render at one receiver, keyed by stage name —
 * the shape AudioEngine's stageTrims wants.
 *
 * Per receiver; see `trim` above. A position with no entry falls back to the
 * engine's constant, which assets.test.js exists to prevent.
 */
function stageTrimsOf(config, receiverId) {
    const decoded = decodedSourceOf(config);
    if (!decoded) return {};

    const perPosition = decoded.trim.ambisonic;
    const db = perPosition && perPosition[receiverId];
    return Number.isFinite(db) ? { ambisonic: db } : {};
}

/**
 * Base path of a receiver's files within a given set, ending in the trailing
 * "-" that AudioEngine completes with a channel number or suffix.
 *
 * The stem comes from the church, not the set: both inherit `irName`.
 */
function responseBaseIn(source, config, receiverId) {
    const stem = config.receivers[receiverId].irName || `${source.ir.prefix}_${receiverId}`;
    return `${source.ir.dir}/${stem}-`;
}

/**
 * Base path of a receiver's impulse response pair — channels 1 and 2, which
 * stereo convolves. Always the published library.
 */
function impulseResponseBase(config, receiverId) {
    return responseBaseIn(config, config, receiverId);
}

/**
 * Base path of a receiver's B-format file, or "" where the church has no
 * recovered set. ambisonicAvailable() reads the empty string to keep the button
 * dead without a fetch that would only 404.
 */
function decodedResponseBase(config, receiverId) {
    const decoded = decodedSourceOf(config);
    return decoded ? responseBaseIn(decoded, config, receiverId) : "";
}

/**
 * Path of the 360 photo taken at a receiver position
 */
function panoramaPath(config, receiverId) {
    const { dir, prefix, ext } = config.panorama;
    return `${dir}/${prefix}_${receiverId}${ext}`;
}

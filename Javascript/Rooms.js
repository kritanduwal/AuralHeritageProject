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
 *     A church's files sit one level below its own folder, in a folder named for
 *     how its capsules were levelled:
 *
 *         IR/<Church>/Normalized/        the published library, always present
 *         IR/<Church>/Not Normalized/    the original captures, where recovered
 *
 *     The split is the library's own, not a convention imposed on it: the two
 *     sets hold the same measurement at two different levellings, so they carry
 *     identical file names and could not share a folder. A church that has only
 *     ever been published has the one folder, which is why `Normalized` is
 *     spelled out for every church rather than appended where a sibling exists.
 * panorama.dir + "/" + panorama.prefix + "_" + receiverId + panorama.ext
 *     gives the 360 photo. Extensions are case-sensitive once deployed, so they
 *     are spelled here exactly as the files are named on disk.
 * soundfieldYaw
 *     the panorama yaw, in degrees, at which the ambisonic recording's own
 *     front points. Omitted where the two already agree.
 *
 *     The photograph and the recording were not oriented together: the array's
 *     front axis is wherever it was set down, the panorama's zero wherever the
 *     camera started. Half this collection differs by 180 degrees, and the gap
 *     is not cosmetic — head tracking turns the soundfield by the camera's
 *     bearing, so an offset of half a turn reverses which ear a source moves
 *     toward as you look around. Found by ear: turn the view and check that a
 *     source crosses to the opposite ear rather than following you.
 *
 *     It only affects the live ambisonic render, the one mode whose soundfield
 *     is still steerable at playback. The other three bake their orientation in.
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
 * unnormalized
 *     this church's un-normalized original captures — the `Not Normalized`
 *     folder beside the published one — present only where those have been
 *     recovered, and reached through /unnormalized (see Features.js).
 *
 *     THE TWO DECODED STAGES ONLY. The measured binaural render and the live
 *     ambisonic one read from here; stereo and the virtual-loudspeaker render
 *     stay on the published library under every flag. See decodedSourceOf() for
 *     why — briefly, those two convolve impulse-response channels 1 and 2
 *     through ConvolverNodes that equal-power normalize, which scales the
 *     recovered level relationships back out, so the swap would change how they
 *     sound without improving them and would move the reference the other
 *     stages are matched against.
 *
 *     Carries the three things that describe the files and nothing else:
 *
 *         ir             where the recovered set lives
 *         trim           `brir` and `ambisonic` only, being the two stages that
 *                        read it. No `binaural`: that stage plays the published
 *                        library along with the stereo it is matched to, so its
 *                        figure belongs to the church's own trim.
 *         soundfieldYaw  optional. Belongs to the files rather than the room
 *                        only because the church's own value is not the
 *                        measurement it resembles; see soundfieldYawOf(). Omit
 *                        it where the recovered set agrees with it.
 *
 *     The receivers and the panoramas are not repeated: those describe the
 *     room, which the recovery did not change.
 *
 *     Its trims are not comparable with the church's own and are not meant to
 *     be. The published capsules were each peak-normalized to 1.0 while the
 *     originals were scaled as a set by aformat-to-bformat.js --gain auto, so
 *     the decoded stages land some 11 dB apart depending on which they were
 *     built from — fifteen to twenty dB of attenuation against a few. Both are
 *     measured the same way, by tools/measure-loudness.js, and against the same
 *     stereo, which is the whole point of leaving stereo where it is.
 *
 *     Every church without the key plays its published library under the flag
 *     exactly as it does without it, so the flag means "the originals where
 *     they exist" rather than "only churches that have originals".
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
        trim:     { binaural: 0.7, brir: -17.8, ambisonic: -20 },
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
        trim:     { binaural: 0.8, brir: -16.5, ambisonic: -18.7 },
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
        trim:     { binaural: 0.6, brir: -17.4, ambisonic: -19.5 },
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
        trim:     { binaural: 1, brir: -19.4, ambisonic: -21.7 },
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
        trim:     { binaural: 0.7, brir: -20.2, ambisonic: -22.6 },
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
        trim:     { binaural: 0.9, brir: -18.7, ambisonic: -21 },
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
        ir:       { dir: "IR/First Presbyterian Church, KY/Normalized", prefix: "FPC KY" },
        panorama: { dir: "Images/First Presbyterian Church, KY", prefix: "First Presbyterian Church, KY", ext: ".jpg" },
        soundfieldYaw: 180,
        trim:     { binaural: 0.3, brir: -16.3, ambisonic: -18.7 },
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
        trim:     { binaural: 0.4, brir: -18.6, ambisonic: -21.3 },
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
        trim:     { binaural: 0.1, brir: -15.4, ambisonic: -17.9 },
        // The first church whose original captures were recovered.
        unnormalized: {
            ir:   { dir: "IR/Monastery Immaculate Conception, IN/Not Normalized", prefix: "MIC_IN" },
            trim: { brir: 2.6, ambisonic: 2.5 },
            // Zero, not the 180 above, and stated rather than omitted. The
            // originals put the direct sound at azimuth -39 deg — front, and
            // within a degree of it at all six positions — so the array's front
            // and the panorama's already agree. Half a turn on top of that
            // renders the source behind the listener, where its lateral motion
            // runs backwards: drag the view left and it moves further left
            // instead of handing over to the right ear.
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
        trim:     { binaural: 1.3, brir: -16.3, ambisonic: -18.5 },
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
        trim:     { binaural: 0.9, brir: -21.4, ambisonic: -23.7 },
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
 * Which set of files the two DECODED stages play from: a church's un-normalized
 * originals where the flag asks for them and the church has them, and its
 * published library otherwise.
 *
 * The decoded stages only. Stereo and the virtual-loudspeaker render keep the
 * published library under every flag, because swapping it would change what
 * they sound like without improving them: both convolve impulse-response
 * channels 1 and 2 through ConvolverNodes that equal-power normalize, which
 * scales the recovered level relationships straight back out. All that would
 * survive the swap is the incidental difference between two takes of the same
 * measurement — a different length, a different L/R balance — moving the very
 * reference the other stages are matched to.
 *
 * Holding stereo still is what makes the comparison mean something: switch the
 * flag on and the only thing that changes is the two stages whose directions
 * the originals actually repair.
 *
 * Returns something shaped like a church config either way — an `ir`, a `trim`
 * and optionally a `soundfieldYaw` — so callers read the same fields off it
 * without knowing which set answered.
 */
function decodedSourceOf(config) {
    const originals = config.unnormalized;
    return originals && featureEnabled('unnormalized') ? originals : config;
}

/**
 * Which panorama yaw the soundfield calls forward.
 *
 * Follows the decoded set, since the live ambisonic render is the only stage a
 * rotation reaches. Overridable per set, unlike the receivers and the
 * panoramas, because the published library's value is not the measurement it
 * looks like: it was found by ear against a decode whose directions are invalid
 * — the capsules having each been normalized on their own — so it records
 * whatever offset made a broken soundfield sit least wrong, not where the array
 * was actually facing. A set that decodes correctly cannot inherit that.
 *
 * Falls back to the church's own value, so a recovered set that genuinely
 * agrees with it says nothing.
 */
function soundfieldYawOf(config) {
    const yaw = decodedSourceOf(config).soundfieldYaw;
    return Number.isFinite(yaw) ? yaw : (config.soundfieldYaw || 0);
}

/**
 * Output levels for this church's stages, taking each from the set that stage
 * is actually playing.
 *
 * A trim calibrates files, so it has to follow them. With the originals
 * engaged, the decoded stages are the only ones reading from them — binaural
 * stays on the published library along with the stereo it is matched against,
 * and so keeps the published library's figure.
 */
function stageTrimsOf(config) {
    const decoded = decodedSourceOf(config);
    if (decoded === config) return config.trim;

    return { ...config.trim, brir: decoded.trim.brir, ambisonic: decoded.trim.ambisonic };
}

/**
 * Base path of a receiver's files within a given set. AudioEngine appends the
 * channel number or the suffix, so this deliberately ends in the trailing "-".
 *
 * The stem comes from the church rather than from the set: `irName` records how
 * a position was filed at the session, which both sets inherit.
 */
function responseBaseIn(source, config, receiverId) {
    const stem = config.receivers[receiverId].irName || `${source.ir.prefix}_${receiverId}`;
    return `${source.ir.dir}/${stem}-`;
}

/**
 * Base path of a receiver's impulse response pair — channels 1 and 2, which
 * stereo and the virtual-loudspeaker render convolve.
 *
 * Always the published library. See decodedSourceOf() for why the originals do
 * not reach these two stages.
 */
function impulseResponseBase(config, receiverId) {
    return responseBaseIn(config, config, receiverId);
}

/**
 * Base path of a receiver's decoded files — the BRIR pair and the B-format —
 * which the measured binaural and live ambisonic stages convolve.
 *
 * The originals where this visit asked for them and the church has them. The
 * two bases are usually the same string; they differ only under /unnormalized,
 * and only for a church that has been recovered.
 */
function decodedResponseBase(config, receiverId) {
    return responseBaseIn(decodedSourceOf(config), config, receiverId);
}

/**
 * Path of the 360 photo taken at a receiver position
 */
function panoramaPath(config, receiverId) {
    const { dir, prefix, ext } = config.panorama;
    return `${dir}/${prefix}_${receiverId}${ext}`;
}

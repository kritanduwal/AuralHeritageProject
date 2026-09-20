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
 *     It only affects the headphone render, whose soundfield is still steerable
 *     at playback. Stereo bakes its orientation in.
 * unnormalized
 *     this church's un-normalized original captures — the `Not Normalized`
 *     folder beside the published one — present only where those have been
 *     recovered.
 *
 *     THE HEADPHONE RENDER READS THIS AND NOTHING ELSE, which is why the button
 *     is dead on a church that has no such key. A decode is a weighted sum
 *     across the four capsules, so it needs their levels relative to each other
 *     intact; the published library's capsules were each peak-normalized on
 *     their own, which destroys exactly that. A render built from them sounds
 *     spatial while pointing sound in directions nobody recorded, so it is not
 *     offered at all rather than offered wrong. See "Why not an ambisonic
 *     decode" in README.md.
 *
 *     Stereo is untouched by any of this: it convolves impulse-response
 *     channels 1 and 2 through ConvolverNodes that equal-power normalize, so it
 *     plays the published library at every church and stays the reference the
 *     headphone render is trimmed against.
 *
 *     Carries the three things that describe the files and nothing else:
 *
 *         ir             where the recovered set lives
 *         trim           `ambisonic` only, being the one stage that reads it,
 *                        and PER RECEIVER within it:
 *
 *                            trim: { ambisonic: { R1: -17.6, R2: -7.4, … } }
 *
 *                        In dB: negative is quieter, zero leaves the stage at
 *                        whatever level its own processing produced, and the
 *                        value replaces AMBISONIC_TRIM_DB outright rather than
 *                        nudging it. Bounded at -40 and +12 dB.
 *
 *                        PER RECEIVER RATHER THAN PER CHURCH, and the spread is
 *                        not small: St Francis runs from -17.6 dB at R1 to -3.3
 *                        at R4. That is not noise in the measurement, it is the
 *                        two sets disagreeing about what distance does.
 *
 *                        The published capsules were each peak-normalized on
 *                        their own, so every position's stereo IR sits at full
 *                        scale however far back it was recorded — stereo does
 *                        not get quieter as you move away from the source. The
 *                        recovered set was scaled by one factor for the whole
 *                        church, so it keeps the real level relationships
 *                        between seats and does. The gap between them therefore
 *                        grows with distance, and one number per church cannot
 *                        close it: the front rows come back loud enough to clip
 *                        and the back rows nearly inaudible.
 *
 *                        Correcting it here rather than in the files is
 *                        deliberate. Rescaling each position's B-format would
 *                        destroy exactly the between-seat relationships that
 *                        make the recovered set worth having — see
 *                        SET_GAIN_TARGET_PEAK_DB in aformat-to-bformat.js. The
 *                        files stay a faithful measurement; this is a listening
 *                        calibration against a reference that was itself
 *                        normalized per position.
 *
 *                        Measured rather than guessed: tools/measure-loudness.js
 *                        renders the stage through the same chain the engine
 *                        builds and matches its ITU-R BS.1770 loudness to
 *                        stereo's, position by position. Run it with --write to
 *                        refresh these.
 *         soundfieldYaw  optional. Belongs to the files rather than the room
 *                        only because the church's own value is not the
 *                        measurement it resembles; see soundfieldYawOf(). Omit
 *                        it where the recovered set agrees with it.
 *
 *     The receivers and the panoramas are not repeated: those describe the
 *     room, which the recovery did not change.
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
            // Zero, not the 180 above, for the reason given at Monastery
            // Immaculate Conception: these originals put the direct sound at
            // azimuth -39 to -43 deg — front, and within four degrees of it at
            // all eight positions — so the array's front and the panorama's
            // already agree. Confirmed by ear.
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
        // The first church whose original captures were recovered.
        unnormalized: {
            ir:   { dir: "IR/Monastery Immaculate Conception, IN/Not Normalized", prefix: "MIC_IN" },
            trim: { ambisonic: { R1: -4, R2: 3.8, R3: 2.7, R4: 4.2, R5: 1.9, R6: 2.4 } },
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
            // Zero for the same reason, and on the same evidence: the direct
            // sound measures -40 to -41 deg across all five positions, so the
            // church's half turn would render it behind the listener.
            // Confirmed by ear, as above.
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
 * Which set of files the headphone render decodes: a church's un-normalized
 * originals, or nothing at all where they were never recovered.
 *
 * Nothing rather than a fallback to the published library, and that is the
 * whole design. A decode needs the four capsules' levels relative to each other
 * intact, and the published capsules were each peak-normalized on their own, so
 * a render built from them would sound spatial while pointing sound in
 * directions nobody recorded. Offering a wrong answer is worse here than
 * offering none: nothing about it sounds broken, so there is no way to hear
 * that it is.
 *
 * Stereo does not consult this at all. It plays the published library at every
 * church, which keeps it the fixed reference the headphone render is trimmed
 * against.
 *
 * @returns the recovered set — `ir`, `trim` and optionally `soundfieldYaw` — or
 *          null for a church that has none
 */
function decodedSourceOf(config) {
    return config.unnormalized || null;
}

/**
 * Which panorama yaw the soundfield calls forward.
 *
 * Read off the recovered set, since the headphone render is the only stage a
 * rotation reaches and that set is the only thing it plays. Stated there rather
 * than inherited from the church, because the church's own value is not the
 * measurement it looks like: it was found by ear against a decode whose
 * directions are invalid — the capsules having each been normalized on their
 * own — so it records whatever offset made a broken soundfield sit least wrong,
 * not where the array was actually facing.
 *
 * Falls back to the church's value, so a recovered set that genuinely agrees
 * with it says nothing.
 */
function soundfieldYawOf(config) {
    const decoded = decodedSourceOf(config);
    const yaw = decoded && decoded.soundfieldYaw;
    return Number.isFinite(yaw) ? yaw : (config.soundfieldYaw || 0);
}

/**
 * Output level for this church's headphone render at one receiver, keyed by
 * stage name — the shape AudioEngine's stageTrims wants.
 *
 * A trim calibrates files, so it comes from the set the stage plays. A church
 * with no recovered set has no such stage, and so no trim to state.
 *
 * Resolved per receiver because the calibration is: see `trim` above for why a
 * single figure per church leaves the front rows clipping and the back rows
 * quiet. A position with no entry is left to the engine's own constant, which
 * is audibly wrong in a known direction rather than quietly approximate —
 * assets.test.js is what stops one going missing in the first place.
 */
function stageTrimsOf(config, receiverId) {
    const decoded = decodedSourceOf(config);
    if (!decoded) return {};

    const perPosition = decoded.trim.ambisonic;
    const db = perPosition && perPosition[receiverId];
    return Number.isFinite(db) ? { ambisonic: db } : {};
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
 * stereo convolves. Always the published library.
 */
function impulseResponseBase(config, receiverId) {
    return responseBaseIn(config, config, receiverId);
}

/**
 * Base path of a receiver's B-format file, which the headphone render decodes,
 * or "" where this church has no recovered set to decode.
 *
 * The empty string rather than a path that would 404: ambisonicAvailable()
 * reads it to decide whether the button can be armed at all, and a church
 * without originals should be answered before a fetch rather than after one.
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

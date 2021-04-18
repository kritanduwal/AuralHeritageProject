function omnitoneSetup()
{
    foa.setRenderingMode('ambisonic');
    foa.initialize().then(function() {
        foainput.connect(foa.input);
        foa.output.connect(outputGain);
        console.log("output size: " + outputGain.channelCount);
        outputGain.connect(dac);
    }, function (onInitializationError) {
        console.error(onInitializationError)
    });
}

function setGain(value)
{
    outputGain.gain.value = value/100;
}

function setPos(yaw, pitch)
{
    Xr.gain.linearRampToValueAtTime(Math.cos(yaw) * X.gain.value + Math.sin(yaw) * Y.gain.value, 1);
    Yr.gain.linearRampToValueAtTime(-Math.sin(yaw) * X.gain.value + Math.cos(yaw) * Y.gain.value, 1);
    //Zr.gain.value =
}

function loadSource(url)
{
    let request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => sourceBuffer = data);
    };
    request.send();
}

function urlExists(url)
{
    let http = new XMLHttpRequest();
    let reverb = url + "1.wav";
    http.open('GET', reverb, false);
    http.send();
    return http.status !== 404;
}

function combineB()
{
    W.connect(foainput, 0, 0);
    Y.connect(Yr);
    Yr.connect(foainput, 0, 1);
    Z.connect(Zr);
    Zr.connect(foainput, 0, 2);
    X.connect(Xr);
    Xr.connect(foainput, 0, 3);
}

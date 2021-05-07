/**
 * Behavor for the settings menu
 * @author Ben Jordan
 */

/**
 * Toggles the settings menu
 */
function toggleDrawer()
{
    if(document.getElementById('drawer').style.display === "none")
    {
        document.getElementById('drawer').style.animation = "fadein .8s ease-in forwards";
        document.getElementById('drawer').style.display = "flex";
        document.getElementById('blurbody').style.animation = "filter .8s ease-in forwards";
        document.getElementById('play').style.animation = "playfilter .8s ease-in forwards";
        document.getElementById('disableui').style.pointerEvents = "none";
        document.getElementById('play').style.pointerEvents = "none";
        setTimeout(function () {
        document.getElementById('blurbody').onclick = toggleDrawer;
    }, 10);
    }
    else
    {
        document.getElementById('drawer').style.animation = "fadeout .8s ease-out forwards";
        document.getElementById('blurbody').style.animation = "unfilter .8s ease-out forwards";
        document.getElementById('play').style.animation = "playunfilter .8s ease-out forwards";
        setTimeout(function (){
            document.getElementById('drawer').style.display = "none";
            document.getElementById('disableui').style.pointerEvents = "all";
            document.getElementById('play').style.pointerEvents = "all";
            document.getElementById('blurbody').onclick = null;
        }, 800);
    }
}

/**
 * Onclick function to switch the room from the settings menu
 */
function switchRoom()
{
    if(room === "RSB")
    {
        room = "CSA";
        updateSrcpos("spS2_CSA");
        updateSrctype("st1_CSA");
        updateRcvpos("rpR1_CSA");
        setImage("Images/wp1909404.jpg");

        document.getElementById('csa').classList.remove('roombutton');
        document.getElementById('csa').classList.add('roombuttonselected');
        document.getElementById('rsb').classList.remove('roombuttonselected');
        document.getElementById('rsb').classList.add('roombutton');

        document.getElementById('RSBui').style.display = "none";
        document.getElementById('CSAui').style.display = "flex";
    }
    else if(room === "CSA")
    {
        room = "RSB";
        updateSrcpos("spS1_RSB");
        updateSrctype("st1_RSB");
        updateRcvpos("rpR1_RSB");
        setImage("Images/wp1909404.jpg");

        document.getElementById('rsb').classList.remove('roombutton');
        document.getElementById('rsb').classList.add('roombuttonselected');
        document.getElementById('csa').classList.remove('roombuttonselected');
        document.getElementById('csa').classList.add('roombutton');

        document.getElementById('RSBui').style.display = "flex";
        document.getElementById('CSAui').style.display = "none";
    }
    toggleDrawer();
    compile();
}

/**
 * Onclick function to switch the format from the settings menu
 */
function switchFormat()
{
    if(format === 'A') //switch to b
    {
        if(isPlaying)
        {
            playpause();
        }
        document.getElementById('bformat').classList.remove('roombutton');
        document.getElementById('bformat').classList.add('roombuttonselected');
        document.getElementById('aformat').classList.remove('roombuttonselected');
        document.getElementById('aformat').classList.add('roombutton');
        format = 'B';

        document.getElementById("error").style.display = "none";
        document.getElementById('RSBui').style.animation = "filter .8s ease-in forwards";
        document.getElementById('CSAui').style.animation = "filter .8s ease-in forwards";
        document.getElementById('RSBui').style.pointerEvents = "none";
        document.getElementById('CSAui').style.pointerEvents = "none";
    }
    else if(format === 'B') //switch to a
    {
        if(isPlaying)
        {
            playpause();
        }
        document.getElementById('aformat').classList.remove('roombutton');
        document.getElementById('aformat').classList.add('roombuttonselected');
        document.getElementById('bformat').classList.remove('roombuttonselected');
        document.getElementById('bformat').classList.add('roombutton');
        format = 'A';

        document.getElementById('RSBui').style.animation = "unfilter .8s ease-in forwards";
        document.getElementById('CSAui').style.animation = "unfilter .8s ease-in forwards";
        document.getElementById('RSBui').style.pointerEvents = "all";
        document.getElementById('CSAui').style.pointerEvents = "all";
    }
    toggleDrawer();
    compile();
}

/**
 * Onclick function to turn off reverb from the settings menu
 */
function switchConvolve()
{
    if(convolve === true)
    {
        document.getElementById('dry').classList.remove('roombutton');
        document.getElementById('dry').classList.add('roombuttonselected');
        document.getElementById('wet').classList.remove('roombuttonselected');
        document.getElementById('wet').classList.add('roombutton');
        convolve = false;
    }
    else if(convolve === false)
    {
        document.getElementById('wet').classList.remove('roombutton');
        document.getElementById('wet').classList.add('roombuttonselected');
        document.getElementById('dry').classList.remove('roombuttonselected');
        document.getElementById('dry').classList.add('roombutton');
        convolve = true;
    }
    toggleDrawer();
    compile();
}

/**
 * Sets the overall gain of the audio
 * @param value The gain value
 */
function setGain(value)
{
    outputGain.gain.value = value/100;
}

function selectSource()
{
    let input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => {
        let file = e.target.files[0];
        if(file.type === 'audio/wav' || 'audio/mpeg')
        {
            if(isPlaying)
            {
                playpause();
            }
            document.getElementById("srcselectlabel").innerHTML = file.name;
            let reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onload = readerEvent => {
                let fileContent = readerEvent.target.result;
                initSource(fileContent);
            }
            toggleDrawer();
        }
        else
        {
            window.alert("error, incorrect file format");
        }
    }
    input.click();
}

function selectBFormat()
{
    let input = document.createElement('input');
    input.type = 'file';
    input.multiple = 'multiple';
    input.onchange = e => {
        let file1 = e.target.files[0];
        let file2 = e.target.files[1];
        let file3 = e.target.files[2];
        let file4 = e.target.files[3];
        if((file1.type === 'audio/wav' || 'audio/mpeg') && (file2.type === 'audio/wav' || 'audio/mpeg')
        && (file3.type === 'audio/wav' || 'audio/mpeg') && (file4.type === 'audio/wav' || 'audio/mpeg'))
        {
            if(isPlaying)
            {
                playpause();
            }
            document.getElementById("bselectlabel").innerHTML = file1.name;

            let reader1 = new FileReader();
            reader1.readAsArrayBuffer(file1);
            reader1.onload = readerEvent => {
                bfile1 = readerEvent.target.result;

                let reader2 = new FileReader();
                reader2.readAsArrayBuffer(file2);
                reader2.onload = readerEvent => {
                    bfile2 = readerEvent.target.result;

                    let reader3 = new FileReader();
                    reader3.readAsArrayBuffer(file3);
                    reader3.onload = readerEvent => {
                        bfile3 = readerEvent.target.result;

                        let reader4 = new FileReader();
                        reader4.readAsArrayBuffer(file4);
                        reader4.onload = readerEvent => {
                            bfile4 = readerEvent.target.result;

                            hasSelected = true;
                            toggleDrawer();
                        }
                    }
                }
            }
        }
        else
        {
            window.alert("error, incorrect file format");
        }
    }
    input.click();
}

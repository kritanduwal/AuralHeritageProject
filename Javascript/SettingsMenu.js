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

function switchRoom()
{
    if(room === "RSB")
    {
        room = "CSA";
        mictype = "ZMH3V";
        srcpos = "spS2_CSA";
        srctype = "st1_CSA";
        rcvpos = "rpR1_CSA";
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
        srcpos = "spS1_RSB";
        srctype = "st1_RSB";
        rcvpos = "rpR1_RSB";
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

function switchFormat()
{
    if(format === 'A')
    {
        document.getElementById('bformat').classList.remove('roombutton');
        document.getElementById('bformat').classList.add('roombuttonselected');
        document.getElementById('aformat').classList.remove('roombuttonselected');
        document.getElementById('aformat').classList.add('roombutton');
        format = 'B';
    }
    else if(format === 'B')
    {
        document.getElementById('aformat').classList.remove('roombutton');
        document.getElementById('aformat').classList.add('roombuttonselected');
        document.getElementById('bformat').classList.remove('roombuttonselected');
        document.getElementById('bformat').classList.add('roombutton');
        format = 'A';
    }
    toggleDrawer();
}

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

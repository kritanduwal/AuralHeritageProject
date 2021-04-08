function compileSelectionRSB()
{
    reverb = "Ambisonic Files/RSB/" + "RSB" + "_" + document.getElementById(srcpos).value + "_" +
        document.getElementById(srctype).value + "_" + document.getElementById(rcvpos).value + "_RODENTI1_FA.";
    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        if(rcvpos === 'rpR4_RSB')
        {
            setImage("Images/RSB/R0010125.jpg");
            if(srctype === 'st1_RSB')
            {
                if(srcpos === 'spS1_RSB')
                {
                    viewer.lookAt(0, 0, 100);
                }
            }
            else if(srctype === 'st2_RSB')
            {
                if(srcpos === 'spS1_RSB')
                {
                    viewer.lookAt(0, 0, 100);
                }
                else if(srcpos === 'spS5_RSB')
                {
                    viewer.lookAt(0, 180, 100);
                }
                else if(srcpos === 'spS3_RSB')
                {
                    viewer.lookAt(0, 0, 100);
                }
            }
        }
        else if(rcvpos === 'rpR2_RSB')
        {
            setImage("Images/RSB/R0010119.jpg");
            if(srcpos === 'spS1_RSB')
            {
                viewer.lookAt(0, 0, 100);
            }
            else if(srcpos === 'spS3_RSB')
            {
                viewer.lookAt(0, 180, 100);
            }
        }
        else if(rcvpos === 'rpR1_RSB')
        {
            setImage("Images/RSB/R0010118.jpg");
            if(srcpos === 'spS3_RSB')
            {
                viewer.lookAt(0, 180, 100);
            }
            else if(srcpos === 'spS7_RSB')
            {
                viewer.lookAt(0, 90, 100);
            }
        }
        else if(rcvpos === 'rpR3_RSB')
        {
            setImage("Images/RSB/R0010120.jpg");
        }
        initAmbisonic(reverb);
        document.getElementById("play").disabled = false;
        document.getElementById("play").classList.remove('stop');
        document.getElementById("play").classList.add('play');
        document.getElementById("play").style.color = "var(--textcolor)";
        updateSelectedColor(true);
    }
    else
    {
        setImage("Images/wp1909404.jpg");
        document.getElementById("error").style.display = "flex";
        if(isPlaying) {
            play_AFormat();
        }
        document.getElementById("play").disabled = true;
        document.getElementById("play").classList.remove('play');
        document.getElementById("play").classList.add('stop');
        updateSelectedColor(false);
    }
}

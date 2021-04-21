function compileSelectionCSA()
{
    reverb = "Ambisonic Files/CSA/" + "CSA" + "_" + document.getElementById(srcpos).value + "_" +
        document.getElementById(srctype).value + "_" + document.getElementById(rcvpos).value + "_ZMH3V_FA.";
    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        if(rcvpos === 'rpR1_CSA')
        {
            setImage("Images/CSA/R0010088.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR2_CSA')
        {
            setImage("Images/CSA/R0010091.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR4_CSA')
        {
            setImage("Images/CSA/R0010098.JPG");
            if(srcpos === 'spS2_CSA')
            {
                viewer.lookAt(0, 215, 100);
            }
            else if(srcpos === 'spS3_CSA')
            {
                viewer.lookAt(0, 170, 100);
            }
            else if(srcpos === 'spS4_CSA')
            {
                viewer.lookAt(0, 270, 100);
            }
        }
        else if(rcvpos === 'rpR5_CSA')
        {
            setImage("Images/CSA/R0010103.JPG");
            if(srcpos === 'spS2_CSA')
            {
                viewer.lookAt(0, 75, 100);
            }
            else if(srcpos === 'spS3_CSA')
            {
                viewer.lookAt(0, 70, 100);
            }
            else if(srcpos === 'spS4_CSA')
            {
                viewer.lookAt(0, 0, 100);
            }
        }
        initAmbisonic(reverb);
        document.getElementById("play").disabled = false;
        // document.getElementById("play").classList.remove('stop');
        // document.getElementById("play").classList.add('play');
        // document.getElementById("play").style.color = "var(--textcolor)";
        updateSelectedColor(true);

        if(isPlaying)
        {
            play();
            play();
        }
    }
    else
    {
        destroyView();
        document.getElementById("error").style.display = "flex";
        if(isPlaying) {
            play();
        }
        document.getElementById("play").disabled = true;
        // document.getElementById("play").classList.remove('play');
        // document.getElementById("play").classList.add('stop');
        updateSelectedColor(false);
    }
}

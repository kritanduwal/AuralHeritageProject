/**
 * A format CSA room compile function
 * @author Ben Jordan
 */
function compileSelectionCSA()
{
    //reverb = "Ambisonic Files/CSA/" + "CSA" + "_" + document.getElementById(srcpos).value + "_" +
    //    document.getElementById(srctype).value + "_" + document.getElementById(rcvpos).value + "_ZMH3V_FA.";

    reverb ="Ambisonic Files/CSA/CSA_S1_J308_R1_ZMH3V_FA.";
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
        initAmbisonicA();
        document.getElementById("play").disabled = false;
        updateSelectedColor(true);

        if(isPlaying)
        {
            playpause();
            playpause();
        }
    }
    else
    {
        destroyView();
        document.getElementById("error").style.display = "flex";
        if(isPlaying) {
            playpause();
        }
        document.getElementById("play").disabled = true;
        updateSelectedColor(false);
    }
}

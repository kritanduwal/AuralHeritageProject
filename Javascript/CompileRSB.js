/**
 *  A format RSB room compile function
 *  @author Ben Jordan
 */
function compileSelectionRSB()
{
    reverb = "Ambisonic Files/RSB/" + "RSB" + "_" + document.getElementById(srcpos).value + "_" +
        document.getElementById(srctype).value + "_" + document.getElementById(rcvpos).value + "_RODENTI1_FA.";

    //reverb ="Ambisonic Files/RSB/RSB_S1_NTID_R2_RODENTI1_FA.";
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

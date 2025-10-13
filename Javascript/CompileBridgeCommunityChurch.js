/**
 * A format Bridge Community Church room compile function
 * @author Kritan Duwal
 */

function compileSelectionBridgeCommunityChurch()
{
    reverb = "Ambisonic Files/Bridge Community Church/" + "Bridge Church" + "_" + 
        document.getElementById(rcvpos).value + "-";
    
    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        
        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_BridgeCommunityChurch')
        {
            setImage("Images/Bridge Community Church/Bridge Community Church_R1.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR2_BridgeCommunityChurch')
        {
            setImage("Images/Bridge Community Church/Bridge Community Church_R2.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR3_BridgeCommunityChurch')
        {
            setImage("Images/Bridge Community Church/Bridge Community Church_R3.JPG");
            viewer.lookAt(0, 190, 100);
        }
        else if(rcvpos === 'rpR4_BridgeCommunityChurch')
        {
            setImage("Images/Bridge Community Church/Bridge Community Church_R4.JPG");
            viewer.lookAt(0, 170, 100);
        }

        document.getElementById("play").disabled = false;
        updateSelectedColor(true);

        irLeftUrl = reverb + "1.wav";
        irRightUrl = reverb + "2.wav";
        initStereoConvolution(irLeftUrl, irRightUrl);
        
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

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
            setTimeout(() => {
                viewer.lookAt(0, 180, 100, { duration: 1000 }); // Smooth rotation over 1 second
            }, 100); // Small delay to ensure image is loaded
        }
        else if(rcvpos === 'rpR2_BridgeCommunityChurch')
        {
            setImage("Images/Bridge Community Church/Bridge Community Church_R2.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 180, 100, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR3_BridgeCommunityChurch')
        {
            setImage("Images/Bridge Community Church/Bridge Community Church_R3.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 190, 100, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR4_BridgeCommunityChurch')
        {
            setImage("Images/Bridge Community Church/Bridge Community Church_R4.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 170, 100, { duration: 1000 });
            }, 100);
        }

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

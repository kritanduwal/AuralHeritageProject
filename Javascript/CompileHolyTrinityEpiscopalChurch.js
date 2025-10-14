/**
 * A format Holy Trinity Episcopal Church room compile function
 * @author Kritan Duwal
 */

function compileSelectionHolyTrinityEpiscopalChurch()
{
    reverb = "Ambisonic Files/Holy Trinity Episcopal Church/" + "Holy Trinity Church" + "_" + 
        document.getElementById(rcvpos).value + "-";
    
    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        
        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_HolyTrinityEpiscopalChurch')
        {
            setImage("Images/Holy Trinity Episcopal Church/Holy Trinity Episcopal Church_R1.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR2_HolyTrinityEpiscopalChurch')
        {
            setImage("Images/Holy Trinity Episcopal Church/Holy Trinity Episcopal Church_R2.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR3_HolyTrinityEpiscopalChurch')
        {
            setImage("Images/Holy Trinity Episcopal Church/Holy Trinity Episcopal Church_R3.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR4_HolyTrinityEpiscopalChurch')
        {
            setImage("Images/Holy Trinity Episcopal Church/Holy Trinity Episcopal Church_R4.JPG");
            viewer.lookAt(0, 180, 100);
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

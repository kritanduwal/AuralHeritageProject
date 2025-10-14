/**
 * A format Church Street United Methodist Church room compile function
 * @author Kritan Duwal
 */

function compileSelectionUnitedMethodistChurch()
{
    reverb = "Ambisonic Files/Church Street United Methodist Church, Knoxville/" + "Church Street United" + "_" + 
        document.getElementById(rcvpos).value + "-";
    
    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        
        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_UnitedMethodistChurch')
        {
            setImage("Images/Church Street United Methodist Church, Knoxville/Church Street United Methodist Church_R1.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR2_UnitedMethodistChurch')
        {
            setImage("Images/Church Street United Methodist Church, Knoxville/Church Street United Methodist Church_R2.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR3_UnitedMethodistChurch')
        {
            setImage("Images/Church Street United Methodist Church, Knoxville/Church Street United Methodist Church_R3.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR4_UnitedMethodistChurch')
        {
            setImage("Images/Church Street United Methodist Church, Knoxville/Church Street United Methodist Church_R4.JPG");
            viewer.lookAt(0, 0, 100);
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

/**
 * A format Downtown Presbyterian Church room compile function
 * @author Kritan Duwal
 */

function compileSelectionDowntownPresbyterianChurch()
{
    reverb = "Ambisonic Files/Downtown Presbyterian Church/" + "Downtown Presbyterian" + "_" + 
        document.getElementById(rcvpos).value + "-";
    
    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        
        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/Downtown Presbyterian Church_R1.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR2_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/Downtown Presbyterian Church_R2.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR3_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/Downtown Presbyterian Church_R3.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR4_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/Downtown Presbyterian Church_R4.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR5_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/Downtown Presbyterian Church_R5.JPG");
            viewer.lookAt(0, 0, 100);
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

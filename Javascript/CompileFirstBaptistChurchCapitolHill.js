/**
 * A format First Baptist Church Capitol Hill room compile function
 * @author Kritan Duwal
 */

function compileSelectionFirstBaptistChurchCapitolHill()
{
    reverb = "Ambisonic Files/First Baptist Church Capitol Hill/" + "First Baptist Church" + "_" +
        document.getElementById(rcvpos).value + "-";
    
    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        
        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_FirstBaptistChurchCapitolHill')
        {
            setImage("Images/First Baptist Church Capitol Hill/First Baptist Church Capitol Hill_R1.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR2_FirstBaptistChurchCapitolHill')
        {
            setImage("Images/First Baptist Church Capitol Hill/First Baptist Church Capitol Hill_R2.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR3_FirstBaptistChurchCapitolHill')
        {
            setImage("Images/First Baptist Church Capitol Hill/First Baptist Church Capitol Hill_R3.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR4_FirstBaptistChurchCapitolHill')
        {
            setImage("Images/First Baptist Church Capitol Hill/First Baptist Church Capitol Hill_R4.JPG");
            viewer.lookAt(0, 150, 100);
        }
        else if(rcvpos === 'rpR5_FirstBaptistChurchCapitolHill')
        {
            setImage("Images/First Baptist Church Capitol Hill/First Baptist Church Capitol Hill_R5.JPG");
            viewer.lookAt(0, 210, 100);
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

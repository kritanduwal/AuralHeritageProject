/**
 * A format Christ Church Cathedral room compile function
 * @author Kritan Duwal
 */

function compileSelectionChristChurchCathedral()
{
    reverb = "Ambisonic Files/Christ Church Cathedral/" + "Christ Church Cathedral" + "_" + 
        // document.getElementById(srcpos).value + "_" +
        // document.getElementById(srctype).value + "_" + 
        document.getElementById(rcvpos).value + "-";

    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        
        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/Christ Church Cathedral_R1.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR2_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/Christ Church Cathedral_R2.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR3_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/Christ Church Cathedral_R3.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR4_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/Christ Church Cathedral_R4.JPG");
            viewer.lookAt(0, 210, 100);
        }
        else if(rcvpos === 'rpR5_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/Christ Church Cathedral_R5.JPG");
            viewer.lookAt(0, 210, 100);
        }
        else if(rcvpos === 'rpR6_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/Christ Church Cathedral_R6.JPG");
            viewer.lookAt(0, 150, 100);
        }
        else if(rcvpos === 'rpR7_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/Christ Church Cathedral_R7.JPG");
            viewer.lookAt(0, 150, 100);
        }
        else if(rcvpos === 'rpR8_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/Christ Church Cathedral_R8.JPG");
            viewer.lookAt(0, 180, 100);
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

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

    if(rcvpos !== 'rpR1_ChristChurchCathedral' || rcvpos !== 'rpR2_ChristChurchCathedral' || rcvpos !== 'rpR3_ChristChurchCathedral')
    {
        reverb ="Ambisonic Files/CSA/CSA_S1_J308_R1_ZMH3V_FA.";        
    }

    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        
        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/20250709_155620_383-R1.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR2_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/20250709_155612_789-R2.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR3_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/20250709_155605_940-R3.JPG");
            viewer.lookAt(0, 180, 100);
        }
        else if(rcvpos === 'rpR4_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/20250709_155558_095-R4.JPG");
            viewer.lookAt(0, 210, 100);
        }
        else if(rcvpos === 'rpR5_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/20250709_155550_523-R5.JPG");
            viewer.lookAt(0, 210, 100);
        }
        else if(rcvpos === 'rpR6_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/20250709_155543_852-R6.JPG");
            viewer.lookAt(0, 150, 100);
        }
        else if(rcvpos === 'rpR7_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/20250709_155536_295-R7.JPG");
            viewer.lookAt(0, 150, 100);
        }
        else if(rcvpos === 'rpR8_ChristChurchCathedral')
        {
            setImage("Images/Christ Church Cathedral/20250709_155526_783-R8.JPG");
            viewer.lookAt(0, 180, 100);
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

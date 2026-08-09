/**
 * A format St. Augustine Catholic Church room compile function
 * @author Kritan Duwal
 */

function compileSelectionStAugustineIsleta()
{
    reverb = "IR/St Augustine Isleta, NM/" + "St Augustine_Isleta" + "_" +
        document.getElementById(rcvpos).value + "-";

    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";

        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_StAugustineIsleta')
        {
            setImage("Images/St Augustine Isleta, NM/St Augustine_Isleta_R1.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR2_StAugustineIsleta')
        {
            setImage("Images/St Augustine Isleta, NM/St Augustine_Isleta_R2.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR3_StAugustineIsleta')
        {
            setImage("Images/St Augustine Isleta, NM/St Augustine_Isleta_R3.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR4_StAugustineIsleta')
        {
            setImage("Images/St Augustine Isleta, NM/St Augustine_Isleta_R4.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR5_StAugustineIsleta')
        {
            setImage("Images/St Augustine Isleta, NM/St Augustine_Isleta_R5.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
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

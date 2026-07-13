/**
 * Cane Ridge Meeting House room compile function
 * @author Kritan Duwal
 */

function compileSelectionCaneRidgeMeetingHouse()
{
    reverb = "Ambisonic Files/Cane Ridge Meeting House, KY/" + "Cane Ridge KY" + "_" +
        document.getElementById(rcvpos).value + "-";

    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";

        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R1.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR2_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R2.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR3_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R3.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR4_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R4.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR5_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R5.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR6_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R6.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR7_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R7.jpg");
            setTimeout(() => {
                viewer.lookAt(-15, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR8_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R8.jpg");
            setTimeout(() => {
                viewer.lookAt(-15, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR9_CaneRidgeMeetingHouse')
        {
            setImage("Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R9.jpg");
            setTimeout(() => {
                viewer.lookAt(-15, 0, 120, { duration: 1000 });
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

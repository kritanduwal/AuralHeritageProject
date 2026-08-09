/**
 * A format Monastery Immaculate Conception room compile function
 * @author Kritan Duwal
 */

function compileSelectionMonasteryImmaculateConception()
{
    reverb = "IR/Monastery Immaculate Conception, IN/" + "MIC_IN" + "_" +
        document.getElementById(rcvpos).value + "-";

    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";

        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_MonasteryImmaculateConception')
        {
            setImage("Images/Monastery Immaculate Conception, IN/MIC_IN_R1.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR2_MonasteryImmaculateConception')
        {
            setImage("Images/Monastery Immaculate Conception, IN/MIC_IN_R2.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR3_MonasteryImmaculateConception')
        {
            setImage("Images/Monastery Immaculate Conception, IN/MIC_IN_R3.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR4_MonasteryImmaculateConception')
        {
            setImage("Images/Monastery Immaculate Conception, IN/MIC_IN_R4.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR5_MonasteryImmaculateConception')
        {
            setImage("Images/Monastery Immaculate Conception, IN/MIC_IN_R5.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR6_MonasteryImmaculateConception')
        {
            setImage("Images/Monastery Immaculate Conception, IN/MIC_IN_R6.JPG");
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

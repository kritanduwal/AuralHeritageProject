/**
 * First Presbyterian Church, KY room compile function
 * @author Kritan Duwal
 */

function compileSelectionFirstPresbyterianChurchKY()
{
    reverb = "Ambisonic Files/First Presbyterian Church, KY/" + "FPC KY" + "_" +
        document.getElementById(rcvpos).value + "-";

    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";

        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R1.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR2_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R2.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR3_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R3.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR4_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R4.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR5_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R5.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR6_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R6.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR7_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R7.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR8_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R8.jpg");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR9_FirstPresbyterianChurchKY')
        {
            setImage("Images/First Presbyterian Church, KY/First Presbyterian Church, KY_R9.jpg");
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

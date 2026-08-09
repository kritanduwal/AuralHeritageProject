/**
 * A format Basilica of St. Francis Xavier Proto-Cathedral room compile function
 * @author Kritan Duwal
 */

function compileSelectionBasilicaStFrancis()
{
    const rcv = document.getElementById(rcvpos).value;

    // R8 recordings are named with a "balcony" prefix instead of following the standard pattern
    if(rcv === 'R8')
    {
        reverb = "IR/Basilica St. Francis, IN/" + "St Francis_IN_balcony " + rcv + "-";
    }
    else
    {
        reverb = "IR/Basilica St. Francis, IN/" + "St Francis_IN" + "_" + rcv + "-";
    }

    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";

        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_BasilicaStFrancis')
        {
            setImage("Images/Basilica St. Francis, IN/St Francis_IN_R1.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR2_BasilicaStFrancis')
        {
            setImage("Images/Basilica St. Francis, IN/St Francis_IN_R2.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR3_BasilicaStFrancis')
        {
            setImage("Images/Basilica St. Francis, IN/St Francis_IN_R3.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR4_BasilicaStFrancis')
        {
            setImage("Images/Basilica St. Francis, IN/St Francis_IN_R4.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR5_BasilicaStFrancis')
        {
            setImage("Images/Basilica St. Francis, IN/St Francis_IN_R5.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR6_BasilicaStFrancis')
        {
            setImage("Images/Basilica St. Francis, IN/St Francis_IN_R6.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR7_BasilicaStFrancis')
        {
            setImage("Images/Basilica St. Francis, IN/St Francis_IN_R7.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR8_BasilicaStFrancis')
        {
            setImage("Images/Basilica St. Francis, IN/St Francis_IN_R8.JPG");
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

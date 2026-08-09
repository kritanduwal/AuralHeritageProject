/**
 * A format Santuario de Nuestra Senora de Guadalupe room compile function
 * @author Kritan Duwal
 */

function compileSelectionOurLadyOfGuadalupe()
{
    reverb = "IR/Our Lady of Guadalupe, NM/" + "Guadalupe_SantaFe" + "_" +
        document.getElementById(rcvpos).value + "-";

    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";

        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_OurLadyOfGuadalupe')
        {
            setImage("Images/Our Lady of Guadalupe, NM/Guadalupe_SantaFe_R1.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR2_OurLadyOfGuadalupe')
        {
            setImage("Images/Our Lady of Guadalupe, NM/Guadalupe_SantaFe_R2.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR3_OurLadyOfGuadalupe')
        {
            setImage("Images/Our Lady of Guadalupe, NM/Guadalupe_SantaFe_R3.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR4_OurLadyOfGuadalupe')
        {
            setImage("Images/Our Lady of Guadalupe, NM/Guadalupe_SantaFe_R4.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR5_OurLadyOfGuadalupe')
        {
            setImage("Images/Our Lady of Guadalupe, NM/Guadalupe_SantaFe_R5.JPG");
            setTimeout(() => {
                viewer.lookAt(0, 0, 120, { duration: 1000 });
            }, 100);
        }
        else if(rcvpos === 'rpR6_OurLadyOfGuadalupe')
        {
            setImage("Images/Our Lady of Guadalupe, NM/Guadalupe_SantaFe_R6.JPG");
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

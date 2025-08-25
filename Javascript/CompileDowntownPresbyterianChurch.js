/**
 * A format Downtown Presbyterian Church room compile function
 * @author Kritan Duwal
 */

function compileSelectionDowntownPresbyterianChurch()
{
    //reverb = "Ambisonic Files/DowntownPresbyterianChurch/" + "DowntownPresbyterianChurch" + "_" + document.getElementById(srcpos).value + "_" +
    //    document.getElementById(srctype).value + "_" + document.getElementById(rcvpos).value + "_ZMH3V_FA.";

    reverb ="Ambisonic Files/CSA/CSA_S1_J308_R1_ZMH3V_FA.";
    if(urlExists(reverb))
    {
        document.getElementById("error").style.display = "none";
        
        // Set appropriate image and viewer angle based on receiver position
        if(rcvpos === 'rpR1_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/20250715_135921_539.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR2_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/20250715_135929_057.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR3_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/20250715_135936_329.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR4_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/20250715_135943_299.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR5_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/20250715_135949_651.JPG");
            viewer.lookAt(0, 0, 100);
        }
        else if(rcvpos === 'rpR6_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/20250715_135956_911.JPG");
            viewer.lookAt(0, 0, 100);
        }
        // Add more receiver positions as needed for Downtown Presbyterian Church
        // Follow similar pattern:
        /*
        else if(rcvpos === 'rpR2_DowntownPresbyterianChurch')
        {
            setImage("Images/Downtown Presbyterian Church/[appropriate_image].JPG");
            viewer.lookAt(0, [appropriate_angle], 100);
        }
        */

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

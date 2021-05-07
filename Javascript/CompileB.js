/**
 * B format compile function
 * @author Ben Jordan
 */
function compileSelectionB()
{
    if(isPlaying)
    {
        playpause();
        playpause();
    }
    document.getElementById("play").disabled = false;
    updateSelectedColor(true);
    destroyView();

    if(hasSelected)
    {
        initAmbisonicB();
    }
    else
    {
        loadAmbisonicB();
    }
}

/**
 * B format compile function
 * @author Ben Jordan
 */
function compileSelectionB()
{
    if(isPlaying)
    {
        playpause();
        playpause();r
    }
    document.getElementById("play").disabled = false;
    updateSelectedColor(true);
    destroyView();
    initAmbisonicB();
}

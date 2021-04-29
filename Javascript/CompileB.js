/**
 * B format compile function
 * @author Ben Jordan
 */
function compileSelectionB()
{
    if(isPlaying)
    {
        play();
        play();
    }
    document.getElementById("play").disabled = false;
    updateSelectedColor(true);
    destroyView();
    initAmbisonicB();
}

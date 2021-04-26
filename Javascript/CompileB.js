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

/**
 * Behavor for the settings menu
 * @author Ben Jordan, Kritan Duwal
 */

/**
 * Onclick function to switch the room from the settings menu
 * @param selectedRoom The room selected from dropdown
 */
function switchRoom(selectedRoom) {

    room = selectedRoom;

    if(rcvpos !== "")
        document.getElementById(rcvpos).style.backgroundColor = "var(--buttoncolor1)";

    // Hide all room UIs first
    if(selectedRoom !== "Select a Church"){
        document.getElementById("BridgeCommunityChurchui").style.display = "none";
        document.getElementById("ChristChurchCathedralui").style.display = "none";
        document.getElementById("DowntownPresbyterianChurchui").style.display = "none";
        document.getElementById("FirstBaptistChurchCapitolHillui").style.display = "none";
        document.getElementById("HolyTrinityEpiscopalChurchui").style.display = "none";
        document.getElementById("UnitedMethodistChurchui").style.display = "none";
    }

    // Update room and related settings    
    if (room === "BridgeCommunityChurch") {
        document.getElementById("BridgeCommunityChurchui").style.display = "flex";
        srcpos = "spS_BridgeCommunityChurch";
        srctype = "st1_BridgeCommunityChurch";
        rcvpos = "rpR1_BridgeCommunityChurch";
        setImage("Images/wp1909404.jpg");
    } else if (room === "ChristChurchCathedral") {
        document.getElementById("ChristChurchCathedralui").style.display = "flex";
        srcpos = "spS_ChristChurchCathedral";
        srctype = "st1_ChristChurchCathedral";
        rcvpos = "rpR1_ChristChurchCathedral";
        setImage("Images/wp1909404.jpg");
    } else if (room === "DowntownPresbyterianChurch") {
        document.getElementById("DowntownPresbyterianChurchui").style.display = "flex";
        srcpos = "spS_DowntownPresbyterianChurch";
        srctype = "st1_DowntownPresbyterianChurch";
        rcvpos = "rpR1_DowntownPresbyterianChurch";
        setImage("Images/wp1909404.jpg");
    } else if (room === "FirstBaptistChurchCapitolHill") {
        document.getElementById("FirstBaptistChurchCapitolHillui").style.display = "flex";
        srcpos = "spS_FirstBaptistChurchCapitolHill";
        srctype = "st1_FirstBaptistChurchCapitolHill";
        rcvpos = "rpR1_FirstBaptistChurchCapitolHill";
        setImage("Images/wp1909404.jpg");
    } else if (room === "HolyTrinityEpiscopalChurch") {
        document.getElementById("HolyTrinityEpiscopalChurchui").style.display = "flex";
        srcpos = "spS_HolyTrinityEpiscopalChurch";
        srctype = "st1_HolyTrinityEpiscopalChurch";
        rcvpos = "rpR1_HolyTrinityEpiscopalChurch";
        setImage("Images/wp1909404.jpg");
    } else if (room === "UnitedMethodistChurch") {
        document.getElementById("UnitedMethodistChurchui").style.display = "flex";
        srcpos = "spS_UnitedMethodistChurch";
        srctype = "st1_UnitedMethodistChurch";
        rcvpos = "rpR1_UnitedMethodistChurch";
        setImage("Images/wp1909404.jpg");
    }

    compile();
}

function selectSource()
{
    let input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => {
        let file = e.target.files[0];
        if(file.type === 'audio/wav' || 'audio/mpeg')
        {
            if(isPlaying)
            {
                playpause();
            }
            document.getElementById("srcselectlabel").innerHTML = file.name;
            let reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onload = readerEvent => {
                let fileContent = readerEvent.target.result;
                initSource(fileContent);
            }
        }
        else
        {
            window.alert("error, incorrect file format");
        }
    }
    input.click();
}

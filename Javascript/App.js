/**
 * Application state, UI logic, and church data
 * @author Kritan Duwal
 */

// ── Church data from project report ──────────────────────────────────────
const churchData = {
    BridgeCommunityChurch: {
        name: "Bridge Community Church",
        address: "4916 Franklin Pike, Nashville, TN 37220",
        measured: "June 13, 2025, 10:30 AM – 1:30 PM",
        history: [
            "Bridge Community Church is a Korean immigrant church located on Franklin Pike in Nashville, Tennessee. The church is affiliated with both the Southern Baptist Convention and the Korean Baptist Convention of America. The church's mission statement focuses on community, family, and connection.",
            "The church building itself has a very unique history. It was originally a house owned by country singer Hank Williams. Williams' family lived in the house until 1975, when his widow Audrey passed away. Originally a simple house when purchased by the Williams family in 1949, the building was enlarged by Mrs. Williams and served as a showplace home for Hank Williams, Jr. Many of the planned renovations were not completed by the time of Mrs. Williams' passing in 1975 and ownership of the house became contested. The house sat unused for some time until WJRB radio owner Mac Sanders stumbled upon it. Sanders spent nearly a year negotiating and finally purchased the house in 1978 with the goal of restoring and preserving it. The house was subsequently purchased by the Baptist church and is currently being rented to Bridge Community Church. This church is a unique piece of the fabric of Nashville's history."
        ],
        dimensions: { "Width": "48.42 ft", "Length": "37.92 ft", "Height (Floor to Ceiling)": "23.33 ft", "Height (Stage to Ceiling)": "22.71 ft", "Height (Floor to Balcony)": "11.32 ft", "Stage Width": "24.38 ft", "Mic Array Height": "6.40 ft, 9.00 ft", "Speaker Height": "4.43 ft" },
        receivers: { "R1": "16.54 ft", "R2": "26.22 ft", "R3": "23.87 ft", "R4": "23.38 ft" }
    },
    ChristChurchCathedral: {
        name: "Christ Church Cathedral",
        address: "900 Broadway, Nashville, TN 37203",
        measured: "June 12, 2025, 10:30 AM – 1:30 PM",
        history: [
            "Christ Church Cathedral is an Episcopal church located on Broadway in downtown Nashville, Tennessee. The church's first Vestry was elected in June 1829 and the original cornerstone was laid approximately a year later. The church was consecrated on July 6, 1831, officially making it the first Episcopal church in Tennessee. The congregation grew over the next several years, expanding to 72 members by 1837.",
            "The church continued to thrive even during difficult times. Christ Church was one of the few churches that managed to avoid occupation during the Civil War, as the lighting made it an impractical place to house troops. This made it so that Christ Church was the only regularly operating church at certain times during the war; baptisms, confirmations, burials, and weddings still took place at the cathedral.",
            "In 1883, the Vestry bought a new lot with the intent of building a new church. New York architect Francis Hatch Kimball was chosen to design the new building. The chapel was the first part of the new church to be constructed and was completed in 1888. The construction of the chapel alone cost twice as much as the congregation originally budgeted for the entire church, so the rest of the construction was delayed until 1890, when the foundation was finally laid. Another long delay followed; the congregation had not achieved their fundraising goal of $50,000 by 1892. However, they decided to continue with construction regardless. The new church opened on December 16, 1894. Since then, Christ Church has been a pillar of Nashville's religious community, known for its internal stability and external support of the diocese and the broader Episcopal church. In 1997, Christ Church officially became the Cathedral of the Diocese of Tennessee, which consists of 50 different parishes and missions and serves approximately 16,000 communicants. Today, the cathedral's congregation is made up of more than 2,000 members. It is still considered a crucial component of Tennessee's Christian community.",
            "Christ Church Cathedral was designed in the Victorian Gothic style. The outer walls of the church were made from sandstone and the trim was made from limestone. Features of the cathedral include stone gargoyles and tiled vestibules. The tower, which was added to the building in 1947, was designed by local architect Russell E. Hart. Additional architects and craftsmen were enlisted to design interior features like the reredos, altar, and pulpit. Another unique feature of Christ Church Cathedral is an immersion baptismal pool, the only one of its kind in an Episcopal church in Tennessee. In 1894, an immense pipe organ was installed in the chancel. It was replaced with the current organ in 2003. The cathedral is known for its 55 memorial stained-glass windows, 12 of which are originals that were installed in 1894. The remaining windows were designed in various stained glass studios and donated to the cathedral."
        ],
        dimensions: { "Width": "78.22 ft", "Length": "108.20 ft", "Height (Floor to Ceiling)": "47.92 ft", "Height (Stage to Ceiling)": "47.27 ft", "Height (Floor to Balcony)": "9.99 ft", "Stage Width": "25.62 ft", "Mic Array Height": "6.41 ft, 9.00 ft", "Speaker Height": "4.46 ft" },
        receivers: { "R1": "16.00 ft", "R2": "30.50 ft", "R3": "45.50 ft", "R4": "23.90 ft", "R5": "35.62 ft", "R6": "23.90 ft", "R7": "35.62 ft", "R8": "18.30 ft" }
    },
    DowntownPresbyterianChurch: {
        name: "Downtown Presbyterian Church",
        address: "154 Rep. John Lewis Way N., Nashville, TN 37219",
        measured: "July 11, 2025, 10:30 AM – 1:00 PM",
        history: [
            "Downtown Presbyterian Church is a presbyterian church located on Rep. John Lewis Way North in downtown Nashville, Tennessee. The First Presbyterian Church of Nashville was constructed in 1814 at the corner of what is now Church Street and Rep. John Lewis Way North and later destroyed in a fire in 1832. A second structure was built in the same location and met a similar fate in 1848. Following the second fire, the local presbyterian community hired William Strickland, the architect who designed the Tennessee state capitol building, to submit a design for a replacement.",
            "The new church was built in the Egyptian Revival style, which was seeing a renewed surge in popularity following Napoleon's Egyptian campaign in the late 1700s. Funding issues delayed Strickland and construction of his elaborate design was not completed until 1851. The finished product did not quite match Strickland's original vision; the interior decorations ended up being rather modest. During the Civil War, Downtown Presbyterian was seized by the government and converted into a hospital. After the war, the congregation resumed work on both the interior and exterior of the church. In the 1880s, German painters Theo Knoch and John Schleicher were hired to renovate the inside of the church. Among their contributions were two floor-to-ceiling paintings of the Temple of Karnak, intricate stenciled walls, and a coffered ceiling. Other parts of the church underwent improvements over the next several decades; for example, the pipe organ was enlarged in 1914. Downtown Presbyterian continued to serve as a haven during times of strife, being used as a shelter for flood victims in 1927 and 1937 as well as a place for soldiers on leave in Nashville during World War II. In 1954, the original congregation considered leaving Nashville and reestablishing their church elsewhere. After much discussion, it was determined that the members who did not want to leave the original location would take over ownership of the church. In 1955, after this schism, the Downtown Presbyterian Church as it is known today was formed.",
            "In the 1990s, an extensive restoration project began with the goal of restoring the church to its former glory. The original plaster walls were covered with canvas and repainted with the goal of recreating the original paint job as accurately as possible. EverGreene Painting Studios, a company responsible for many other high-profile historic preservation projects like the restoration of the state capitol building, took great care to reproduce the original paint job. According to an article by Donna Dorian Wall, Downtown Presbyterian is considered by many to be \"the single most important Egyptian Revival building in the world,\" making this extensive restoration well worth the effort. In 1993, Downtown Presbyterian was officially designated a historic landmark. The church celebrated its 150th anniversary in 2001 and its current website pledges that it \"stands ready for another 150 years of service to the city.\""
        ],
        dimensions: { "Width": "70.55 ft", "Length": "89.94 ft", "Height (Floor to Ceiling)": "31.62 ft", "Height (Stage to Ceiling)": "30.97 ft", "Stage Width": "26.03 ft", "Mic Array Height": "6.40 ft, 8.85 ft", "Speaker Height": "4.45 ft" },
        receivers: { "R1": "17.86 ft", "R2": "34.73 ft", "R3": "51.56 ft", "R4": "35.48 ft", "R5": "35.66 ft" }
    },
    FirstBaptistChurchCapitolHill: {
        name: "First Baptist Church Capitol Hill",
        address: "625 Rosa L. Parks Blvd., Nashville, TN 37203",
        measured: "June 10, 2025, 9:00 AM – 12:00 PM",
        history: [
            "First Baptist Church, Capitol Hill is a Baptist church located on Rosa L. Parks Boulevard in downtown Nashville, Tennessee. It is a historic predominantly African American church with strong ties to the Civil Rights Movement in Tennessee. The First Baptist Church, Nashville first began accepting Black members in 1843, including enslaved people. In October of 1847, the First Baptist Church's African American congregation established the First Colored Baptist Mission. The next year, the congregation began holding their own separate services. This faction of the church became known as the First Colored Baptist Mission.",
            "During the Civil War, the Union Army occupied the city and impacted the operations of many local churches. The First Baptist Church was confiscated by the army and its pastor was arrested, but the mission continued operating. The mission petitioned for independence from the First Baptist Church in March of 1865; this request was granted and the deed to the First Baptist Church was given to the mission on August 13, 1865. The General Assembly granted a charter to what was then known as the First Colored Baptist Church of Nashville on May 26, 1866. At this time, the church's congregation consisted of 780 members. The church also served the greater Baptist community outside of its congregation by hosting founding meetings for the first national Baptist Conventions. The First Colored Baptist Church purchased a plot of land on which to construct a new church on August 6, 1872, and started using the new building in 1873. By 1884, the church had approximately 2,800 members. Internal issues caused the congregation to split in 1887; this division led to the formation of the Mount Olive Baptist Church. The church was destroyed in a fire in 1893, and the internal struggles continued during this time of turmoil, but the church was able to rebuild.",
            "First Baptist changed and grew over the course of the 20th century. During the Civil Rights Movement, activist and professor James Lawson hosted workshops about civil protest at the church that were attended by many prominent activists, including Diane Nash, Bernard Lafayette, James Bevel, and John Lewis. In 1965, the original charter was amended, and First Colored Baptist Church was renamed as the First Baptist Church, Capitol Hill. On March 5, 1972, the congregation left the church that had been in use since 1896 and moved to its current location. Between 2004 and 2009, services were held in a local high school auditorium while the church was being renovated. In recent years, the church has expanded its ministries, increased cultural preservation efforts, and continued supporting social justice endeavors."
        ],
        dimensions: { "Width": "73.36 ft", "Length": "49.16 ft", "Height (Floor to Ceiling)": "20.76 ft", "Height (Stage to Ceiling)": "17.57 ft", "Height (Floor to Balcony)": "9.19 ft", "Stage Width": "67.34 ft", "Mic Array Height": "6.40 ft, 9.00 ft", "Speaker Height": "3.00 ft" },
        receivers: { "R1": "13.90 ft", "R2": "22.35 ft", "R3": "33.93 ft", "R4": "24.00 ft", "R5": "24.00 ft" }
    },
    HolyTrinityEpiscopalChurch: {
        name: "Church of the Holy Trinity",
        address: "615 6th Avenue S., Nashville, TN 37203",
        measured: "June 11, 2025, 9:00 AM – 12:00 PM",
        history: [
            "The Church of the Holy Trinity is an episcopal church located on 6th Avenue South in downtown Nashville, Tennessee. The church was established in 1849 when Rector Charles S. Tomes of Christ Church Episcopal left his former church to create a \"free Church\" that would not rely on taxes for financial support. Originally called St. Paul's Mission, the church was located in what was then known as South Nashville, a town that was considered completely separate from Nashville proper.",
            "The cornerstone of the current building was placed on May 7, 1852, by Bishop James Hervey Otey. The building itself was designed by New York-based architectural firm Dudley and Wills in the style of an English Parish Church. The design is Gothic and contains many features that are typical of the firm's style, including native stone and open-hammered ceiling beams. Further additions were made over the years, including a stone baptismal font gifted to the church in 1860 and a tower containing a bell constructed in 1861.",
            "Prior to the Civil War, the neighborhood surrounding the Church of the Holy Trinity was considered prosperous and refined. It was known for its \"stately houses\" and for the University of Nashville, which housed a distinguished medical facility. During the war, the church was used as an armory and was severely damaged. The original stained-glass windows were broken, and the pipe organ was dismantled by soldiers. Holy Trinity was able to recover following the war and evolved in interesting ways over the next several years; it reopened as a mission in 1866, grew to parish status by 1872, then reverted to a mission in 1876. By the early 1900s, the neighborhood had become less affluent and more diverse. The mission became an all-Black mission in 1896, and the Church of the Holy Trinity was officially given to its Black communicants by the Diocese of Tennessee in 1907. It was determined that the congregation would not be able to sustain the church financially, so it remained a mission until 1961, when it once again assumed parish status. The church was officially placed on the National Historic Register of Historic places in 1972."
        ],
        dimensions: { "Width": "26.40 ft", "Length": "84.12 ft", "Height (Floor to Ceiling)": "35.60 ft", "Height (Stage to Ceiling)": "28.58 ft", "Height (Floor to Balcony)": "8.52 ft", "Stage Width": "20.49 ft", "Mic Array Height": "6.41 ft, 9.00 ft", "Speaker Height": "15.11 ft" },
        receivers: { "R1": "15.72 ft", "R2": "25.72 ft", "R3": "35.72 ft", "R4": "45.72 ft" }
    },
    UnitedMethodistChurch: {
        name: "Church Street United Methodist Church",
        address: "900 Henley Street, Knoxville, TN 37902",
        measured: "June 27, 2025, 2:00 PM – 5:00 PM",
        history: [
            "Church Street United Methodist Church is a Methodist church located on Henley Street in downtown Knoxville, Tennessee. The first Knoxville Methodist Church was initially constructed in 1816 in a different location on what is now E. Hill Avenue. In 1844, the Methodist Episcopal Church split into North and South locations; the congregation belonged to the South location. Like many cities in the southeast, Knoxville was occupied by Confederate forces during the Civil War. In 1861, both Methodist Episcopal Churches were used as medical and housing facilities for Confederate troops. Despite the occupation, the South church continued to operate. The church was then confiscated by Union forces in 1863 and used as a hospital. Methodist Episcopal Church, South reestablished itself in 1866, regaining the property seven years after the Civil War ended.",
            "A Victorian Gothic church was constructed on the same property in 1878 but unfortunately burned down in 1928. Afterwards, the congregation held a vote and agreed to construct a new building on a larger property on Henley Street. Architects Charles I. Barber and John Russell Pope were hired to design the church in the Gothic Revival style. The congregation pushed through financial difficulties in 1929, and the church was completed in 1931. The first service was held on January 25 of that year, attended by 1,000 worshipers. The Methodist Episcopal Church and the Methodist Protestant Church united in 1939 to form the Methodist Church. The current denomination came to be when the Evangelical United Brethren Church merged in 1968. Over the next several decades, Church Street United Methodist continued to influence the Knoxville community by establishing new churches and other Methodist organizations. The church celebrated its bicentennial in 2016.",
            "Church Street United Methodist is a Gothic Revival church boasting several unique features, including a mural designed to emulate a mosaic painted by Hugh Tyler in 1955-1956, several intricate stained-glass windows, an antiphonal pipe organ, and a tall bell tower. The tower was not fully equipped with bells until 2006, when the church bells rang for the first time in 75 years. Additional wings of the church include an educational center, a welcome center, and a newly renovated parish hall. Church Street United Methodist is a striking example of Gothic Revival architecture that remains a fixture of the Knoxville community more than two centuries after the church was initially established."
        ],
        dimensions: { "Width (Widest)": "73.58 ft", "Width": "51.77 ft", "Length": "138.53 ft", "Height (Floor to Ceiling)": "56.65 ft", "Height (Stage to Ceiling)": "48.99 ft", "Height (Floor to Ceiling, Sides)": "9.13 ft", "Stage Width": "36.27 ft", "Mic Array Height": "6.90 ft, 9.60 ft", "Speaker Height": "4.43 ft" },
        receivers: { "R1": "20.08 ft", "R2": "40.08 ft", "R3": "60.08 ft", "R4": "80.00 ft" }
    },
    CaneRidgeMeetingHouse: {
        name: "Cane Ridge Meeting House",
        address: "1655 Cane Ridge Rd, Paris, KY 40361",
        measured: "June 11, 2026, 9:30 AM – 11:30 AM",
        history: [
            "Cane Ridge Meeting House is a log church located on Cane Ridge Road in Bourbon County, Kentucky. The building was constructed in 1791 by a group of Scots-Irish Presbyterians from North Carolina. The settlers used a collection of local woods, using blue ash logs for walls, and oak and chestnut trees for beams and roof supports. The original floor was made of dirt, there were no windows, and the congregation sat on puncheon benches. By 1798, a puncheon log floor was laid on top of the dirt, windows were cut in the walls, and chinking was put between the logs. African American slaves sat in the gallery on the second floor, which could only be accessed via ladders outside of the church. Around 1795, the congregation's anti-slavery movement was led by minister Robert W. Finley. Presbyterian minister Barton Warren Stone, Cane Ridge's most famous preacher, arrived in 1796. Two years later, he was ordained in the Meeting House.",
            "The Second Great Awakening in the early 19th century was a series of revivals in the American Christian Faith. The week of August 6th, 1801, Cane Ridge hosted its own revival, bringing Christians from near and far. Baptist and Methodist preachers joined the Presbyterian ministers in proclaiming the word of God. Approximately 20,000 to 30,000 people were in attendance. 3,000 to 4,000 of those found new faith, and the event marked the climax of the Western Great Revival.",
            "In 1803, Stone and other ministers were evicted from the Washington Presbytery due to disagreements about strict Calvinism, and formed the Springfield Presbytery. On June 28th, 1804, Stone and five other Presbyterian preachers wrote and signed \"The Last Will and Testament of the Springfield Presbytery.\" The document withdrew them from Calvinism and united Christians along non-sectarian lines. The movement, according to Cane Ridge, was \"based on American democratic ideals of individualism and broad tolerance of Christian expression.\" In 1812, Barton Warren Stone left Cane Ridge. He became an evangelist, moved to Georgetown, Kentucky, and moved again to Jacksonville, Illinois. In 1847, according to his wishes, his remains were brought to Cane Ridge. His service was one of the highest attended in Kentucky history, and a twelve-foot Georgia marble obelisk was erected over his grave.",
            "Throughout the 19th century, the Meeting House underwent many renovations. Cane Ridge closed its doors as a congregation in 1921 due to an aging and declining rural population, however, it remained a visiting site. In 1932, the church underwent its largest renovation to restore it as closely as the original. The siding, ceiling, and interior wall plaster were removed; the east doorway reopened; windows were made to their original sizes; and the gallery and pulpit were reinstalled. By the 1950s, the exterior of the church showed rapid deterioration. To preserve the Meeting House, a shrine was chosen to be built over it. Builders used Cane Ridge golden limestone for the walls and Jessamine County creeks' flagstones for the floor. In 1957, the project was completed and dedicated to Christian Unity."
        ],
        dimensions: { "Width": "47.53 ft", "Length": "28.53 ft", "Height (Floor to Ceiling)": "27.59 ft", "Height (Floor to Balcony)": "8.00 ft", "Mic Array Height": "5.60 ft", "Speaker Height": "3.94 ft", "Pulpit Height": "5.79 ft", "Stage Depth": "4.12 ft", "Stage Width": "9.20 ft", "Stage Height": "2.44 ft", "Shrine Width": "73.00 ft", "Shrine Length": "56.07 ft", "Shrine Height": "38.25 ft", "Domed Edge Width": "29.76 ft", "Domed Edge Length": "14.58 ft", "Domed Edge Height": "28.55 ft" },
        receivers: { "R1": "8.70 ft", "R2": "17.84 ft", "R3": "17.77 ft", "R4": "18.00 ft", "R5": "42.45 ft", "R6": "41.53 ft", "R7": "13.60 ft", "R8": "16.07 ft", "R9": "17.16 ft" }
    },
    FirstPresbyterianChurchKY: {
        name: "First Presbyterian Church",
        address: "171 Market St, Lexington, KY 40507",
        measured: "June 10, 2026, 2:00 PM – 4:00 PM",
        history: [
            "First Presbyterian Church is a presbyterian church located on 171 Market Street in downtown Lexington, Kentucky. Founded in 1784, First Presbyterian Church is the oldest congregation in continuous existence in Lexington. The church's first structure, originally known as \"Mount Zion Church,\" was likely a log cabin established at the current site of the University of Kentucky's Scovell Hall. In 1790, the second structure was erected: a frame building on North Mill Street about 100 feet north of Main Street. Nine years later, the gallery and a cupola with a bell were added. The church trustees determined that the building was too close to the town's business center, and was torn down on September 2nd, 1807.",
            "The same year, a brick building was constructed on the southwest corner of Second and Broadway. The two-storied building measured 80 x 50 feet. It featured a steeple and spire that reached 104 feet from ground level. The new location included a parking lot and sheds to shelter carriages and horses during services, as well as a session house. On Thanksgiving Day of 1847, Abraham Lincoln and his family listened to a sermon delivered by Robert Jefferson Breckinridge, the church's pastor. Breckinridge was widely known for his anti-slavery writings and played a role in preventing Kentucky from seceding from the union. He described slavery as \"an ulcer eating its way into the very heart of the state.\" Lincoln continued to attend Breckinridge's services and the two became friends. In 1857, the building was torn down due to repairs, and a new structure dedicated to Breckinridge was erected on the same site.",
            "1837 saw the split of the Presbyterian denomination into two schools of thought: the New School, which favored emancipation of enslaved peoples, and the Old School, which favored moderate abolitionism. At the start of the Civil War, most members of First Presbyterian Church did not favor secession (although many owned slaves). During the war, the congregations of the First and Second Presbyterian churches were split into pro-southern and pro-northern groups. In 1869, an agreement was reached which consolidated northern groups as Second Presbyterian Church and kept southern groups as First Presbyterian Church.",
            "In 1870, the church sold its building and land to the Main Street Christian Church, what is known today as Broadway Christian. For two years, the congregation was without a permanent home. Services were held temporarily in Melodeon Hall, a three-story masonry building used for social and theatrical events during the week. During that time, the church purchased land between North Mill Street and Market Street, and constructed the current building.",
            "In 1872, the final structure of First Presbyterian Church was built. The gothic revival style project was designed by architect and elder Cincinnatus Shryock and modeled after Trinity Church in New York City. Numerous alterations and additions have occurred over the years such as a fifth bay, education facilities, and office spaces. First Presbyterian Church received a Blue Grass Trust Preservation Award for its most recent renovation in 2007."
        ],
        dimensions: { "Width": "50.69 ft", "Length": "80.84 ft", "Height (Floor to Ceiling)": "30.05 ft", "Height (Stage to Ceiling)": "28.02 ft", "Height (Floor to Balcony)": "13.25 ft", "Stage Width": "22.90 ft", "Mic Array Height": "6.40 ft", "Speaker Height": "3.94 ft" },
        receivers: { "R1": "17.40 ft", "R2": "29.88 ft", "R3": "47.09 ft", "R4": "20.65 ft", "R5": "31.58 ft", "R6": "47.82 ft", "R7": "23.26 ft", "R8": "33.11 ft", "R9": "48.40 ft" }
    }
};

// ── Page state ────────────────────────────────────────────────────────────
let room = "";
let reverb;
let viewer;
let srcpos = "";
let srctype = "";
let rcvpos = "";
destroyView();

function setImage(image) {
    viewer = pannellum.viewer('view', {
        "type": "equirectangular",
        "panorama": image,
        "autoLoad": true,
        "showZoomCtrl": false,
        "mouseZoom": false,
        "compass": false
    });
}

function destroyView() {
    setImage("Images/wp1909404.jpg");
}

function updateSrcpos(val) {
    document.getElementById(srcpos).style.backgroundColor = "var(--buttoncolor2)";
    srcpos = val;
    compile();
}

function updateRcvpos(val) {
    document.getElementById(rcvpos).style.backgroundColor = "var(--buttoncolor1)";
    rcvpos = val;
    compile();
}

function updateSelectedColor(urlexists) {
    if (urlexists) {
        document.documentElement.style.cssText = "--maincolor2: #00f47f";
    } else {
        document.documentElement.style.cssText = "--maincolor2: crimson";
    }
    document.getElementById(srcpos).style.backgroundColor = "var(--maincolor2)";
    document.getElementById(rcvpos).style.backgroundColor = "var(--maincolor2)";
}

function compile() {
    if (room === "BridgeCommunityChurch")              compileSelectionBridgeCommunityChurch();
    else if (room === "ChristChurchCathedral")         compileSelectionChristChurchCathedral();
    else if (room === "DowntownPresbyterianChurch")     compileSelectionDowntownPresbyterianChurch();
    else if (room === "FirstBaptistChurchCapitolHill")  compileSelectionFirstBaptistChurchCapitolHill();
    else if (room === "HolyTrinityEpiscopalChurch")     compileSelectionHolyTrinityEpiscopalChurch();
    else if (room === "UnitedMethodistChurch")          compileSelectionUnitedMethodistChurch();
    else if (room === "CaneRidgeMeetingHouse")          compileSelectionCaneRidgeMeetingHouse();
    else if (room === "FirstPresbyterianChurchKY")      compileSelectionFirstPresbyterianChurchKY();
}

async function playpause() {
    await playStereoFormat();
}

function updateSliderBackground(value) {
    const pct = value;
    document.getElementById('convmix').style.background =
        `linear-gradient(to right, #00205b 0%, #00205b ${pct}%, #d0d0d0 ${pct}%, #d0d0d0 100%)`;
}

function setMix(value) {
    document.getElementById("mixlabel").innerText = `${value}%`;
    setConvolutionMix(value / 100);
    updateSliderBackground(value);
}

function switchTab(tabId, btnEl) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId + '-panel').classList.add('active');
    btnEl.classList.add('active');
}

// ── Church Info Modal ─────────────────────────────────────────────────────
function showChurchInfo() {
    const data = churchData[room];
    if (!data) return;

    document.getElementById('church-info-name').textContent = data.name;
    document.getElementById('church-info-address').textContent = data.address;
    document.getElementById('church-info-date').textContent = 'Measured: ' + data.measured;

    document.getElementById('church-info-history').innerHTML =
        data.history.map(p => `<p>${p}</p>`).join('');

    document.getElementById('church-info-dimensions').innerHTML =
        Object.entries(data.dimensions)
            .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
            .join('');

    document.getElementById('church-info-receivers').innerHTML =
        Object.entries(data.receivers)
            .map(([k, v]) => `<tr><td>${k} to Speakers</td><td>${v}</td></tr>`)
            .join('');

    document.getElementById('church-info-modal').classList.add('open');
}

function closeChurchInfo() {
    document.getElementById('church-info-modal').classList.remove('open');
}

// Keep the church info modal inside whichever element owns fullscreen so it stays visible
document.addEventListener('fullscreenchange', () => {
    const modal = document.getElementById('church-info-modal');
    if (document.fullscreenElement) {
        document.fullscreenElement.appendChild(modal);
    } else {
        document.body.appendChild(modal);
    }
});

import { useState } from "react";
import TouchlineDecorationMotion from "../../components/touchline/TouchlineDecorationMotion";
import TouchlineClubPerimeterTrace from "../../components/touchline/TouchlineClubPerimeterTrace";
import header from "../../components/touchline/ClubOwnerMarketHeader.module.css";
import publicProfile from "../../components/touchline/social/ClubOwnerPublic.module.css";
import slots from "../../components/touchline/fantasy/ClubOwnerCollectionSlots.module.css";

/** Real styles/observer and React replacement, with no account/data mutations. */
export default function MobileDecorationBrowserFixture() {
  const [generation, replace] = useState(0);
  return <><TouchlineDecorationMotion />
    <button id="replace" onClick={() => replace(n => n + 1)} style={{ position: "fixed", bottom: 0, right: 0 }}>Replace portrait</button>
    <header className={header.header} data-plan-preview="vip">
      <section id="panel" className={header.profile} data-touchline-decoration-motion="true">
        <button id="portrait" key={generation} className={header.photoButton} aria-label="Portrait" />
        <div id="nested" data-touchline-decoration-motion="true" style={{ position: "absolute", top: 1300, width: 100, height: 60 }}>
          <button className={header.planAction}>Plan</button>
        </div>
      </section>
      <section className={header.bank} data-touchline-decoration-motion="true">Plan details</section>
    </header>
    <div className={publicProfile.avatar} data-plan="vip">
      <span id="public-portrait" className={publicProfile.avatarPortrait} data-touchline-decoration-motion="true"><span className={publicProfile.avatarFallback}>TL</span></span>
    </div>
    <div style={{ position: "relative", width: 500, maxWidth: "100%", height: 80 }}><TouchlineClubPerimeterTrace accent="#a3ff12" /></div>
    <div className={slots.slots}>{[1, 2, 3].map(value => <div key={value} className={slots.slot} style={{ gridTemplateRows: "auto" }}><label className={slots.priority}>Prioridade<select aria-label={`Priority ${value}`} defaultValue={value}>{[1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></label></div>)}</div>
    <div style={{ height: 2300 }} />
  </>;
}

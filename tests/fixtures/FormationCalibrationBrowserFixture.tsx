import { ArenaAdminShell } from "../../components/arena-admin-shell";
import FormationCalibrationStudio from "../../components/touchline/admin/FormationCalibrationStudio";
import TouchlineLandscapeBoundary from "../../components/touchline/TouchlineLandscapeBoundary";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../../lib/touchlineArena/formation-geometry";

/** Real editor and shell, with code-default geometry and no authenticated account. */
export default function FormationCalibrationBrowserFixture() {
  return <TouchlineLandscapeBoundary skipLabel="Ir ao conteúdo" locale="pt-BR">
    <ArenaAdminShell profileName="Synthetic Owner" profileEmail="fixture@example.invalid" isOwner>
      <FormationCalibrationStudio locale="pt-BR" registry={TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY} history={[]} />
    </ArenaAdminShell>
  </TouchlineLandscapeBoundary>;
}

export { validateSundayDeploymentEnvironment } from "../deployment-target";
import { validateSundayDeploymentEnvironment } from "../deployment-target";

if (import.meta.main) {
  validateSundayDeploymentEnvironment(process.env);
}

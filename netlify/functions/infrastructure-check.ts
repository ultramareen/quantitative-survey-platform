import { getInfrastructureService } from "../../src/server/modules/infrastructure/runtime";

const infrastructureCheck = async () => {
  const deploymentId = process.env.DEPLOY_ID;
  if (deploymentId)
    await getInfrastructureService().observeProductionDeployment(deploymentId);
  await getInfrastructureService().runCheck();
  return new Response(null, { status: 204 });
};

export default infrastructureCheck;

export const config = { schedule: "0 */3 * * *" };

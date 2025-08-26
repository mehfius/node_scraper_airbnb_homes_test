const myHeaders = new Headers();
myHeaders.append("X-Airbnb-API-Key", "d306zoyjsyarp7ifhu67rjxn52tv0t20");
myHeaders.append("Cookie", "ak_bmsc=F51B462CDD139C9702FD528E562AB914~000000000000000000000000000000~YAAQJNhJF+vJAcSYAQAAgz485xwrQmUN9xIlNV3xX2cYvz6THC0hWu8i27POZzPvpop4jbyLIYXY6DBB19b87OrPXEVQixykbt5Zbe5P6hfy3Q140KMGJ0lDXJNifJa/KYWhfEMhImm8lK6GHXnGF65u5v8VdfLgI4giooq/2siLvsdtU+rqw04XvL4aHPpk6xMCODvYmhajajlqR95a3wTdtKZPK6PvDkR5ksPWIdc5M/adxhG2ppiB5Avb5LH2t23QnmrzH063Y4G2pHt5YThuxCFfnZDF8WAiDKmwPfdKONhUBhVi2522GHudJ6eeV0zX2BDraFzvDtF/Lkgf8v1nNgsk/u6KevYztq42IERb; bev=SEU_BEV_TOKEN; bm_sv=33D792928B9446D91C030BF24BE79609~YAAQDckQAsbTX82YAQAAWSJm5xwZkrnCJCbVGFXWY61aZ5rLC04i7F8xhnGBYdxNA42hgjhboS0RNSYpIpL1atr2QoBgGuJKIItd38d7pwP5hWX4XzBNerrfFG+sJD+pTE1gQ7rQQQiFttcw3qPQg3G3bCyxGmjqOUN1qA7kqOYulinEvQnBr4+nLDh30/BTvOo/0Jrq8qoIeq7aLoNal6+6ko5kpoflDT4LsWxQ3UlaAlN9294SR7EX/+/yOXirdnBM~1; everest_cookie=1746372890.EANTg2MWY2MjQzYzRhNz.rqExSJ6ocs6XTdRy_PU0ke3_td1EoSA6HK23lm41_rI; jitney_client_session_created_at=1756159308; jitney_client_session_id=7006308b-af65-4cc6-8963-a4f269f99198; jitney_client_session_updated_at=1756159331");

const requestOptions = {
  method: "GET",
  headers: myHeaders,
  redirect: "follow"
};

fetch("https://www.airbnb.com.br/api/v3/PdpAvailabilityCalendar/8f08e03c7bd16fcad3c92a3592c19a8b559a0d0855a84028d1163d4733ed9ade?operationName=PdpAvailabilityCalendar&locale=pt&currency=BRL&variables={\"request\":{\"count\":12,\"listingId\":\"47025970\",\"month\":8,\"year\":2025}}&extensions={\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"8f08e03c7bd16fcad3c92a3592c19a8b559a0d0855a84028d1163d4733ed9ade\"}}", requestOptions)
  .then((response) => response.text())
  .then((result) => console.log(result))
  .catch((error) => console.error(error));
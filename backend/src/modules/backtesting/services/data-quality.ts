export function backtestDataIssues(result:Record<string,unknown>):string[]{
 const quality=result.historyQuality as {missingMinutes?:number;missingExitSessions?:number}|undefined;
 const issues:string[]=[];
 if(quality?.missingMinutes)issues.push(quality.missingMinutes+' expected minute observations are absent');
 if(quality?.missingExitSessions)issues.push(quality.missingExitSessions+' sessions have no traded candle at the intraday exit time');
 const unavailable=Math.max(0,Number(result.unavailableDecisions??0)-Number(result.warmupDecisions??0));
 if(unavailable>0)issues.push(unavailable+' rule decisions after entry warm-up could not be evaluated');
 const unready=result.unreadyInstruments as string[]|undefined;
 if(unready?.length)issues.push(unready.length+' stocks never had enough history to evaluate entry rules');
 return issues;
}

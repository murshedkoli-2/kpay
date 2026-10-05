package bd.kpay.agent;
import android.app.job.*;
import android.content.*;
import org.json.*;
import java.util.concurrent.*;

public class SyncJob extends JobService {
 private final ExecutorService executor=Executors.newSingleThreadExecutor();private volatile boolean stopped;
 public static void schedule(Context c,boolean immediate){JobInfo.Builder b=new JobInfo.Builder(immediate?101:100,new ComponentName(c,SyncJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL);if(immediate)b.setMinimumLatency(1000);else b.setPeriodic(15*60*1000L);c.getSystemService(JobScheduler.class).schedule(b.build());}
 public boolean onStartJob(JobParameters p){stopped=false;executor.execute(()->{boolean retry=false;try{retry=sync(this);}catch(Exception e){getSharedPreferences("health",0).edit().putString("error",e.getMessage()==null?"Sync unavailable":e.getMessage()).commit();retry=true;}if(!stopped)jobFinished(p,retry);});return true;}
 public boolean onStopJob(JobParameters p){stopped=true;return true;}
 public void onDestroy(){executor.shutdownNow();super.onDestroy();}
 static synchronized boolean sync(Context c) throws Exception {
  if(Vault.get(c,"key").isEmpty())return false;
  try(Queue q=new Queue(c)){
   int sub=Device.selected(c);if(sub<0){health(c,"Select the physical collection SIM first");return false;}
   Api.call(c,"POST","/api/agent/heartbeat",new JSONObject().put("queue_depth",q.depth()).put("permission",Device.permitted(c)?"granted":"denied").put("subscription_id",sub).put("binding_health",Device.healthy(c)?"healthy":"missing").put("capture_paused",c.getSharedPreferences("settings",0).getBoolean("paused",false)),true);
   JSONObject config=Api.call(c,"GET","/api/agent/config",null,true);Vault.save(c,"config",config.toString());
   if(!config.optString("status").equals("active")){health(c,"Device "+config.optString("status")+". Admin approval is required.");return false;}
   if(!Device.permitted(c)||!Device.healthy(c)||config.optInt("approved_subscription",-1)!=sub){health(c,"SMS permission or approved SIM binding needs attention");return false;}
   boolean retry=false;
   for(JSONObject row:q.list(true)){
    String id=row.getString("id");int attempts=row.getInt("attempts")+1;
    try{JSONObject payload=new JSONObject(Vault.decrypt(row.getString("payload")));JSONObject r=Api.call(c,"POST","/api/agent/receipts",payload,true);String state=r.optString("status");q.update(id,state.equals("parsed")?"uploaded":"review",r.optString("reason",state),r.optString("id"),attempts,0);}
    catch(Api.Failure f){if(f.status==401){health(c,"Authentication paused. Check device approval, clock or re-pairing.");return false;}if(f.status==409||f.status==422){q.update(id,"review",f.getMessage(),"",attempts,0);continue;}if(f.status==429||f.status>=500){q.update(id,"queued","Server unavailable", "",attempts,next(attempts));retry=true;break;}q.update(id,"review","HTTP "+f.status,"",attempts,0);}
    catch(Exception e){q.update(id,"queued","Connection interrupted","",attempts,next(attempts));retry=true;break;}
   }
   c.getSharedPreferences("health",0).edit().putLong("last_sync",System.currentTimeMillis()).putString("error",retry?"Waiting to retry connection":"").commit();return retry;
  }catch(Api.Failure f){if(f.status==401){health(c,"Authentication paused. Check approval, phone clock or re-pairing.");return false;}throw f;}
 }
 static long next(int attempts){return System.currentTimeMillis()+Math.min(3600000L,30000L*(1L<<Math.min(attempts,7)))+ThreadLocalRandom.current().nextLong(15000);}
 static void health(Context c,String text){c.getSharedPreferences("health",0).edit().putString("error",text).commit();}
}

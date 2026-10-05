package bd.kpay.agent;
import android.content.*;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import org.json.*;
import java.util.UUID;

public class SmsReceiver extends BroadcastReceiver {
 public void onReceive(Context c,Intent intent){
  if(!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction()))return;
  PendingResult pending=goAsync();new Thread(()->{try{capture(c.getApplicationContext(),intent);}catch(Exception e){c.getSharedPreferences("health",0).edit().putString("capture_error","Receipt could not be persisted. Check available storage and app setup.").commit();}finally{pending.finish();}},"kpay-capture").start();
 }
 static void capture(Context c,Intent intent) throws Exception {
  if(c.getSharedPreferences("settings",0).getBoolean("paused",false)||Vault.get(c,"key").isEmpty())return;
  JSONObject config=Device.config(c);SmsMessage[] parts=Telephony.Sms.Intents.getMessagesFromIntent(intent);if(parts==null||parts.length==0)return;
  String origin=parts[0].getOriginatingAddress();if(origin==null||!Device.allowed(config,origin))return;
  StringBuilder body=new StringBuilder();for(SmsMessage p:parts){if(!origin.equals(p.getOriginatingAddress()))return;body.append(p.getMessageBody());}
  // Never forward OTP/security messages even when a provider uses the same sender.
  if(body.toString().matches("(?is).*(\\bOTP\\b|one[ -]time|verification code|security code|\\bPIN\\b|password|ওটিপি|পিন|পাসওয়ার্ড).*"))return;
  if(body.length()==0||body.length()>config.optInt("max_message_length",4000))return;
  int sub=-1;Object extra=intent.getExtras()==null?null:intent.getExtras().get("subscription");if(extra instanceof Number)sub=((Number)extra).intValue();
  JSONObject account=config.optJSONObject("account");if(account==null)return;
  boolean bound=sub>=0&&sub==Device.selected(c)&&sub==config.optInt("approved_subscription",-1)&&Device.healthy(c);
  long received=System.currentTimeMillis(),smsTime=parts[0].getTimestampMillis();
  JSONObject event=new JSONObject().put("account_id",account.getString("id")).put("client_event_id",UUID.randomUUID().toString()).put("sms_sender",origin).put("message",body.toString()).put("subscription_id",sub).put("sim",account.optString("sim")).put("captured_at",received).put("sms_timestamp",smsTime).put("config_version",config.optInt("version")).put("body_hash",Vault.hash(body.toString()));
  String fingerprint=Vault.hash(account.getString("id")+"\n"+sub+"\n"+origin+"\n"+smsTime+"\n"+body);
  try(Queue q=new Queue(c)){q.add(event,origin,received,fingerprint,bound?"queued":"quarantined");}
  c.getSharedPreferences("health",0).edit().putLong("last_capture",received).remove("capture_error").commit();SyncJob.schedule(c,true);
 }
}

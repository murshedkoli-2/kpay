package bd.kpay.agent;
import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.graphics.Bitmap;
import java.io.FileOutputStream;
import java.util.UUID;
import org.json.*;

// Compiled into development APKs only; run through Android's instrumentation CLI.
public class SmokeTest extends Instrumentation {
 private Bundle arguments;
 public void onCreate(Bundle b){super.onCreate(b);arguments=b;start();}
 void check(boolean condition,String label){if(!condition)throw new AssertionError(label);}
 public void onStart(){Bundle result=new Bundle();try{
  Context c=getTargetContext();Vault.init();String encrypted=Vault.encrypt("Synthetic payment evidence");check(!encrypted.contains("Synthetic"),"Local payload is encrypted");check(Vault.decrypt(encrypted).equals("Synthetic payment evidence"),"Encryption roundtrip");Vault.save(c,"smoke-secret","test credential");check(Vault.get(c,"smoke-secret").equals("test credential"),"Encrypted credential roundtrip");
  JSONObject config=new JSONObject().put("sms_senders",new JSONArray().put("bKash"));check(Device.allowed(config,"bkash"),"Allowlist is case insensitive");check(!Device.allowed(config,"Unrelated"),"Unrelated sender is excluded");
  String id=UUID.randomUUID().toString(),fingerprint=UUID.randomUUID().toString();JSONObject event=new JSONObject().put("client_event_id",id).put("message","Synthetic queue test");
  try(Queue q=new Queue(c)){int before=q.depth();q.add(event,"Synthetic",System.currentTimeMillis(),fingerprint,"queued");q.add(event,"Synthetic",System.currentTimeMillis(),fingerprint,"queued");check(q.depth()==before+1,"Duplicate capture is idempotent");}
  try(Queue q=new Queue(c)){boolean found=false;for(JSONObject row:q.list(true))if(row.getString("id").equals(id)){found=true;check(Vault.decrypt(row.getString("payload")).contains("Synthetic queue test"),"Queue survives database reopen");q.update(id,"uploaded","Test acknowledgment","test-server-id",1,0);}check(found,"Receipt persists");}
  if(arguments!=null&&arguments.containsKey("code")){Api.enroll(c,arguments.getString("code"));JSONObject assigned=Api.call(c,"GET","/api/agent/config",null,true);Vault.save(c,"config",assigned.toString());check(assigned.getString("status").equals("pending"),"Native enrollment waits for approval");check(!Vault.get(c,"key").isEmpty(),"Credential persists encrypted");}
  Intent launch=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);Activity activity=startActivitySync(launch);waitForIdleSync();check(activity!=null,"Main activity starts");
  Bitmap screenshot=getUiAutomation().takeScreenshot();if(screenshot!=null){try(FileOutputStream out=new FileOutputStream(c.getFilesDir()+"/agent-smoke.png")){screenshot.compress(Bitmap.CompressFormat.PNG,100,out);}screenshot.recycle();}
  result.putString("result","PASS: vault encryption, credential storage, sender filtering, durable deduplicated queue, optional signed enrollment and activity launch");finish(Activity.RESULT_OK,result);
 }catch(Throwable e){result.putString("error",e.toString());finish(Activity.RESULT_CANCELED,result);}}
}

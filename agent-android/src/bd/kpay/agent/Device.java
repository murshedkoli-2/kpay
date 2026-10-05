package bd.kpay.agent;
import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.telephony.*;
import java.util.*;
import org.json.*;

final class Device {
 static boolean permitted(Context c){return c.checkSelfPermission(Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED;}
 static List<SubscriptionInfo> sims(Context c){if(c.checkSelfPermission(Manifest.permission.READ_PHONE_STATE)!=PackageManager.PERMISSION_GRANTED)return Collections.emptyList();SubscriptionManager s=c.getSystemService(SubscriptionManager.class);List<SubscriptionInfo> list=s.getActiveSubscriptionInfoList();return list==null?Collections.emptyList():list;}
 static int selected(Context c){return c.getSharedPreferences("settings",0).getInt("subscription",-1);}
 static boolean healthy(Context c){for(SubscriptionInfo s:sims(c))if(s.getSubscriptionId()==selected(c))return true;return false;}
 static JSONObject config(Context c) throws Exception {String s=Vault.get(c,"config");return s.isEmpty()?new JSONObject():new JSONObject(s);}
 static boolean allowed(JSONObject config,String origin){JSONArray senders=config.optJSONArray("sms_senders");if(senders!=null)for(int i=0;i<senders.length();i++)if(senders.optString(i).equalsIgnoreCase(origin))return true;return false;}
}

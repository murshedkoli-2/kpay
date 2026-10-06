package bd.kpay.agent;
import android.content.Context;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONObject;

final class Api {
 static final class Failure extends Exception {final int status;Failure(int s,String m){super(m);status=s;}}
 static JSONObject call(Context ctx,String method,String path,JSONObject body,boolean enrolled) throws Exception {
  String data=body==null?"":body.toString();URL u=new URL(BuildConfig.SERVER+path);
  if(!u.getProtocol().equals("https")&&!(BuildConfig.DEBUG&&u.getHost().equals("127.0.0.1")))throw new Exception("A trusted HTTPS server is required");
  HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setRequestMethod(method);c.setRequestProperty("Content-Type","application/json");
  try {
   if(enrolled){String time=Long.toString(System.currentTimeMillis()),nonce=UUID.randomUUID().toString();c.setRequestProperty("Authorization","Bearer "+Vault.get(ctx,"key"));c.setRequestProperty("X-Kpay-Time",time);c.setRequestProperty("X-Kpay-Nonce",nonce);c.setRequestProperty("X-Kpay-Signature",Vault.sign(method+"\n"+path+"\n"+time+"\n"+nonce+"\n"+Vault.hash(data)));}
   if(body!=null){c.setDoOutput(true);byte[] b=data.getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(b.length);try(OutputStream o=c.getOutputStream()){o.write(b);}}
   int status=c.getResponseCode();InputStream stream=status<400?c.getInputStream():c.getErrorStream();String response="";if(stream!=null){try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(out.size()+n>100000)throw new IOException("Response too large");out.write(b,0,n);}response=out.toString("UTF-8");}}
   JSONObject r;try{r=new JSONObject(response);}catch(Exception e){throw new Failure(status,"Invalid server response ("+status+")");}if(status<200||status>=300)throw new Failure(status,r.optString("error","Server error"));return r;
  }finally{c.disconnect();}
 }
 static void enroll(Context c,String code) throws Exception {String key=Vault.publicKey();JSONObject b=new JSONObject().put("code",code).put("public_key",key).put("proof",Vault.sign("kpay-enroll\n"+code+"\n"+key)).put("app_version","android-1.2").put("android_version",android.os.Build.VERSION.RELEASE);JSONObject r=call(c,"POST","/api/agent/enroll",b,false);Vault.save(c,"key",r.getString("key"));Vault.save(c,"device_id",r.getString("device_id"));}
}

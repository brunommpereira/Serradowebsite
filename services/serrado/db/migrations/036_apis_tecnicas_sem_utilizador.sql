-- APIs técnicas: a credencial deixa de estar associada a um utilizador. Quem pede e quem decide vêm sempre no
-- pedido (requesterEmail / approverEmail) e o perfil de cada email é validado no momento (conta ativa e permissões).
alter table api_clients drop column user_id;
